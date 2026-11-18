import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { eq, sql } from "drizzle-orm";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { migratePublic } from "../../src/database/migrate.js";
import { DataSourceRegistry } from "../../src/database/registry.js";
import {
  createSchoolTables,
  schoolSchemaName,
  TenantRepository,
  TenantService,
} from "../../src/infra/tenant/index.js";
import { schoolTenants } from "../../src/schema/public.js";
import { POSTGRES_IMAGE } from "../helpers/postgres-image.js";

let container: StartedPostgreSqlContainer | undefined;
let sources: DataSourceRegistry;
let repository: TenantRepository;
let service: TenantService;
let otherProcess: TenantService;
const schools: string[] = [];

async function register(
  status: typeof schoolTenants.$inferSelect.status = "active",
  datasource = "default",
) {
  const id = v7();
  const { pool, db } = sources.get();
  await pool.query(
    "INSERT INTO public.orgs(id,type,name,code,region_code) VALUES($1::uuid,'school','租户测试学校',$1::text,'990000')",
    [id],
  );
  await db.insert(schoolTenants).values({
    schoolId: id,
    schemaName: schoolSchemaName(id),
    status,
    datasource,
  });
  return id;
}

async function createPhysical(schoolId: string, datasource = "default") {
  const name = schoolSchemaName(schoolId);
  const t = createSchoolTables(name);
  const { db } = sources.get(datasource);
  await db.execute(sql`CREATE SCHEMA ${sql.identifier(name)}`);
  await db.execute(sql`CREATE TABLE ${t.migrations} (
    version integer PRIMARY KEY, filename text NOT NULL,
    checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
}

beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const extra = new URL(container.getConnectionUri());
  extra.pathname = "/tenant_extra";
  sources = new DataSourceRegistry({
    DATABASE_URL: container.getConnectionUri(),
    EXTRA_DATASOURCES: { remote: extra.href },
  });
  const { pool, db } = sources.get();
  await migratePublic(pool);
  await pool.query("CREATE DATABASE tenant_extra");
  await pool.query(
    "INSERT INTO public.regions(code,name,level,path) VALUES('990000','租户测试省',1,'990000')",
  );
  repository = new TenantRepository(db);
  service = new TenantService(repository, sources);
  otherProcess = new TenantService(new TenantRepository(db), sources);
  for (let i = 0; i < 10; i++) {
    const id = await register();
    schools.push(id);
    await createPhysical(id);
  }
}, 120000);

afterAll(async () => {
  vi.restoreAllMocks();
  await sources?.onApplicationShutdown();
  await container?.stop();
}, 30000);

it("35个public迁移可安全重跑，登记约束阻止坏schema、状态、数据源与悬挂学校", async () => {
  const { pool, db } = sources.get();
  expect(await migratePublic(pool)).toEqual([]);
  const schoolId = schools[0] as string;
  for (const changes of [
    { schemaName: "public" },
    { schemaName: schoolSchemaName(v7()) },
    { schemaName: `${schoolSchemaName(schoolId)}\n` },
    { schemaName: schoolSchemaName(schoolId).toUpperCase() },
    { datasource: "x;evil" },
    { schemaVersion: -1 },
    { version: -1 },
  ]) {
    await expect(
      db
        .update(schoolTenants)
        .set(changes)
        .where(eq(schoolTenants.schoolId, schoolId)),
    ).rejects.toThrow();
  }
  await expect(
    pool.query(
      "UPDATE public.school_tenants SET status='unknown' WHERE school_id=$1",
      [schoolId],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  const missing = v7();
  await expect(
    db
      .insert(schoolTenants)
      .values({ schoolId: missing, schemaName: schoolSchemaName(missing) }),
  ).rejects.toThrow();
});

it("50个并发访问在10所学校分别写入读取，schema数据不会串校且表对象复用", async () => {
  const connections = await Promise.all(
    Array.from({ length: 50 }, async (_, i) => {
      const schoolId = schools[i % 10] as string;
      const context = await service.forSchool(schoolId);
      await context.db
        .insert(context.t.migrations)
        .values({ version: i + 1, filename: schoolId, checksum: "test" });
      return context;
    }),
  );
  for (const [index, schoolId] of schools.entries()) {
    const { db, t } = await service.forSchool(schoolId);
    const rows = await db.select().from(t.migrations);
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.filename === schoolId)).toBe(true);
    expect(connections[index]?.t).toBe(t);
    expect(connections[index + 10]?.t).toBe(t);
  }
});

it("同一数据源的public与学校写入使用同一事务，可一起回滚", async () => {
  const id = schools[0] as string;
  const { db, t } = await service.forSchool(id);
  await expect(
    db.transaction(async (tx) => {
      await tx
        .update(schoolTenants)
        .set({ lastError: "transaction-test" })
        .where(eq(schoolTenants.schoolId, id));
      await tx
        .insert(t.migrations)
        .values({ version: 1000, filename: "rollback", checksum: "test" });
      throw new Error("rollback-both");
    }),
  ).rejects.toThrow("rollback-both");
  const [tenant] = await db
    .select()
    .from(schoolTenants)
    .where(eq(schoolTenants.schoolId, id));
  expect(tenant?.lastError).toBeNull();
  expect(
    await db.select().from(t.migrations).where(eq(t.migrations.version, 1000)),
  ).toEqual([]);
});

it("不存在、未登记及所有非active状态返回404，不暴露登记细节", async () => {
  await expect(service.forSchool(v7())).rejects.toMatchObject({ code: 90004 });
  const missingTenant = v7();
  await sources
    .get()
    .pool.query(
      "INSERT INTO public.orgs(id,type,name,code,region_code) VALUES($1::uuid,'school','未开通学校',$1::text,'990000')",
      [missingTenant],
    );
  await expect(service.forSchool(missingTenant)).rejects.toMatchObject({
    code: 90004,
  });
  for (const status of [
    "provisioning",
    "failed",
    "suspended",
    "archived",
    "destroyed",
  ] as const) {
    await expect(
      service.forSchool(await register(status)),
    ).rejects.toMatchObject({ code: 90004 });
  }
});

it("真实状态提交后两个服务实例均立即失效；回滚不错误失效缓存", async () => {
  const id = schools[1] as string;
  const before = await service.forSchool(id);
  const otherBefore = await otherProcess.forSchool(id);
  const snapshot = vi.spyOn(repository, "snapshot");
  expect(await service.forSchool(id)).toBe(before);
  expect(snapshot).not.toHaveBeenCalled();
  const { db } = sources.get();
  await db
    .update(schoolTenants)
    .set({ status: "failed", lastError: "test failure" })
    .where(eq(schoolTenants.schoolId, id));
  for (const instance of [service, otherProcess]) {
    await expect(instance.forSchool(id)).rejects.toMatchObject({ code: 90004 });
  }
  await db
    .update(schoolTenants)
    .set({ status: "active", lastError: null })
    .where(eq(schoolTenants.schoolId, id));
  const restored = await service.forSchool(id);
  expect(restored.t).not.toBe(before.t);
  expect((await otherProcess.forSchool(id)).t).not.toBe(otherBefore.t);
  const revision = await repository.revision();
  await expect(
    db.transaction(async (tx) => {
      await tx
        .update(schoolTenants)
        .set({ status: "failed" })
        .where(eq(schoolTenants.schoolId, id));
      throw new Error("rollback-state");
    }),
  ).rejects.toThrow("rollback-state");
  expect(await repository.revision()).toBe(revision);
  expect(await service.forSchool(id)).toBe(restored);
  snapshot.mockRestore();
});

it("学校停用、软删除和登记软删除同样使已热缓存立即拒绝访问", async () => {
  const id = schools[2] as string;
  const { pool, db } = sources.get();
  for (const statement of [
    "UPDATE public.orgs SET status=0 WHERE id=$1",
    "UPDATE public.orgs SET deleted_at=now() WHERE id=$1",
  ]) {
    await service.forSchool(id);
    await pool.query(statement, [id]);
    await expect(service.forSchool(id)).rejects.toMatchObject({ code: 90004 });
    await pool.query(
      "UPDATE public.orgs SET status=1,deleted_at=NULL WHERE id=$1",
      [id],
    );
  }
  await service.forSchool(id);
  await db
    .update(schoolTenants)
    .set({ deletedAt: new Date() })
    .where(eq(schoolTenants.schoolId, id));
  await expect(service.forSchool(id)).rejects.toMatchObject({ code: 90004 });
  await db
    .update(schoolTenants)
    .set({ deletedAt: null })
    .where(eq(schoolTenants.schoolId, id));
});

it("额外数据源在独立数据库读写，登记迁移到该数据源后不复用旧池或旧表对象", async () => {
  const id = await register();
  await createPhysical(id);
  await createPhysical(id, "remote");
  const before = await service.forSchool(id);
  await before.db
    .insert(before.t.migrations)
    .values({ version: 1, filename: "default", checksum: "test" });
  const remote = sources.get("remote");
  const t = createSchoolTables(schoolSchemaName(id));
  await remote.db
    .insert(t.migrations)
    .values({ version: 1, filename: "remote", checksum: "test" });
  await sources
    .get()
    .db.update(schoolTenants)
    .set({ datasource: "remote" })
    .where(eq(schoolTenants.schoolId, id));
  const after = await service.forSchool(id);
  expect(after.db).toBe(remote.db);
  expect(after.db).not.toBe(before.db);
  expect(after.t).not.toBe(before.t);
  expect(
    (await after.db.select().from(after.t.migrations)).map(
      (row) => row.filename,
    ),
  ).toEqual(["remote"]);
  expect(
    (await before.db.select().from(before.t.migrations)).map(
      (row) => row.filename,
    ),
  ).toEqual(["default"]);
  expect(sources.get("remote")).toBe(remote);
});

it("非学校组织即使有登记也返回404；未知数据源不会静默落到平台库", async () => {
  const companyId = v7();
  const { pool, db } = sources.get();
  await pool.query(
    "INSERT INTO public.orgs(id,type,name,code) VALUES($1::uuid,'company','非学校组织',$1::text)",
    [companyId],
  );
  await db.insert(schoolTenants).values({
    schoolId: companyId,
    schemaName: schoolSchemaName(companyId),
    status: "active",
  });
  await expect(service.forSchool(companyId)).rejects.toMatchObject({
    code: 90004,
  });
  const unconfigured = await register("active", "unconfigured");
  await expect(service.forSchool(unconfigured)).rejects.toThrow(
    "未配置的数据源",
  );
});

it("登记删除会立即清除两实例的热缓存", async () => {
  const id = schools[3] as string;
  await service.forSchool(id);
  await otherProcess.forSchool(id);
  await sources
    .get()
    .pool.query("DELETE FROM public.school_tenants WHERE school_id=$1", [id]);
  await expect(service.forSchool(id)).rejects.toMatchObject({ code: 90004 });
  await expect(otherProcess.forSchool(id)).rejects.toMatchObject({
    code: 90004,
  });
});

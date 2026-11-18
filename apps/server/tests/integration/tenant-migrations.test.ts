import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { migratePublic } from "../../src/database/migrate.js";
import { DataSourceRegistry } from "../../src/database/registry.js";
import {
  schoolSchemaName,
  TenantMigrator,
  TenantRepository,
} from "../../src/infra/tenant/index.js";
import { MigrationRegistry } from "../../src/infra/tenant/migration-registry.js";
import { POSTGRES_IMAGE } from "../helpers/postgres-image.js";

let container: StartedPostgreSqlContainer | undefined;
let sources: DataSourceRegistry;
let migrator: TenantMigrator;
const directories: string[] = [];
async function directory(sql: string) {
  const path = await mkdtemp(`${tmpdir()}/tenant-migrations-`);
  directories.push(path);
  await writeFile(`${path}/0001_initial.sql`, sql);
  return pathToFileURL(`${path}/`);
}
const initial = "CREATE TABLE __SCHEMA__.probe(id integer PRIMARY KEY)";
async function register(
  datasource = "default",
  status = "active",
  physical = true,
) {
  const id = v7();
  await sources
    .get()
    .pool.query(
      "INSERT INTO public.orgs(id,type,name,code,region_code) VALUES($1::uuid,'school','迁移测试学校',$1::text,'990000')",
      [id],
    );
  await sources
    .get()
    .pool.query(
      "INSERT INTO public.school_tenants(school_id,schema_name,datasource,status) VALUES($1,$2,$3,$4)",
      [id, schoolSchemaName(id), datasource, status],
    );
  if (physical)
    await sources
      .get(datasource)
      .pool.query(`CREATE SCHEMA "${schoolSchemaName(id)}"`);
  return id;
}
async function state(id: string) {
  return (
    await sources
      .get()
      .pool.query("SELECT * FROM public.school_tenants WHERE school_id=$1", [
        id,
      ])
  ).rows[0];
}
async function history(id: string, source = "default") {
  return (
    await sources
      .get(source)
      .pool.query(
        `SELECT * FROM "${schoolSchemaName(id)}"._migrations ORDER BY version`,
      )
  ).rows;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const remote = new URL(container.getConnectionUri());
  remote.pathname = "/migration_remote";
  sources = new DataSourceRegistry({
    DATABASE_URL: container.getConnectionUri(),
    EXTRA_DATASOURCES: { remote: remote.href },
  });
  await migratePublic(sources.get().pool);
  await sources.get().pool.query("CREATE DATABASE migration_remote");
  await sources
    .get()
    .pool.query(
      "INSERT INTO public.regions(code,name,level,path) VALUES('990000','迁移测试省',1,'990000')",
    );
  migrator = new TenantMigrator(
    sources,
    new TenantRepository(sources.get().db),
  );
}, 120000);
afterAll(async () => {
  vi.restoreAllMocks();
  await sources?.onApplicationShutdown();
  await container?.stop();
  await Promise.all(
    directories.map((path) => rm(path, { recursive: true, force: true })),
  );
}, 30000);

it("增量迁移、历史与版本登记、无变化重跑不推进登记版本", async () => {
  const id = await register();
  const dir = await directory(initial);
  expect(await migrator.migrateSchool(id, dir)).toMatchObject({
    status: "active",
    schemaVersion: 1,
    applied: ["0001_initial.sql"],
  });
  const version = (await state(id)).version;
  expect(await migrator.migrateSchool(id, dir)).toMatchObject({
    status: "active",
    applied: [],
  });
  expect((await state(id)).version).toBe(version);
  await writeFile(
    new URL("0002_column.sql", dir),
    "ALTER TABLE __SCHEMA__.probe ADD COLUMN note text",
  );
  expect(await migrator.migrateSchool(id, dir)).toMatchObject({
    status: "active",
    schemaVersion: 2,
    applied: ["0002_column.sql"],
  });
  expect((await history(id)).map((row) => row.version)).toEqual([1, 2]);
  expect((await state(id)).schema_version).toBe(2);
});

it("历史修改与删除均拒绝，不执行漂移后的SQL", async () => {
  const id = await register();
  const dir = await directory(initial);
  await migrator.migrateSchool(id, dir);
  await writeFile(new URL("0001_initial.sql", dir), `${initial} -- changed`);
  expect(await migrator.migrateSchool(id, dir)).toMatchObject({
    status: "failed",
    failureRecorded: true,
  });
  expect((await state(id)).last_error).toContain("历史不匹配");
  expect(await history(id)).toHaveLength(1);
  await rm(new URL("0001_initial.sql", dir));
  expect(await migrator.migrateSchool(id, dir)).toMatchObject({
    status: "failed",
  });
  await writeFile(new URL("0001_initial.sql", dir), initial);
  expect(await migrator.migrateSchool(id, dir)).toMatchObject({
    status: "active",
    applied: [],
  });
});

it("单校SQL失败全部待执行DDL及记录回滚，修复外部条件后可单独重试", async () => {
  const good = await register();
  const bad = await register();
  const dir = await directory(initial);
  await migrator.migrateSchool(good, dir);
  await migrator.migrateSchool(bad, dir);
  await sources
    .get()
    .pool.query(`CREATE TABLE "${schoolSchemaName(bad)}".blocked(id integer)`);
  await writeFile(
    new URL("0002_add.sql", dir),
    "ALTER TABLE __SCHEMA__.probe ADD COLUMN note text",
  );
  await writeFile(
    new URL("0003_blocked.sql", dir),
    "CREATE TABLE __SCHEMA__.blocked(id integer)",
  );
  const results = await Promise.all([
    migrator.migrateSchool(good, dir),
    migrator.migrateSchool(bad, dir),
  ]);
  expect(results[0]).toMatchObject({ status: "active", schemaVersion: 3 });
  expect(results[1]).toMatchObject({
    status: "failed",
    error: "学校迁移失败，版本：3",
    failureRecorded: true,
  });
  expect(await state(bad)).toMatchObject({
    status: "failed",
    schema_version: 1,
  });
  expect(await history(bad)).toHaveLength(1);
  const cols = await sources
    .get()
    .pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='probe'",
      [schoolSchemaName(bad)],
    );
  expect(cols.rows.map((row) => row.column_name)).toEqual(["id"]);
  await sources
    .get()
    .pool.query(`DROP TABLE "${schoolSchemaName(bad)}".blocked`);
  expect(await migrator.migrateSchool(bad, dir)).toMatchObject({
    status: "active",
    schemaVersion: 3,
  });
  expect((await state(bad)).last_error).toBeNull();
});

it("20次同校并发迁移只有一次实际执行，记录没有重复", async () => {
  const id = await register();
  const dir = await directory(initial);
  const results = await Promise.all(
    Array.from({ length: 20 }, () => migrator.migrateSchool(id, dir)),
  );
  expect(results.every((row) => row.status === "active")).toBe(true);
  expect(
    results.filter(
      (row) => row.status === "active" && row.applied.length === 1,
    ),
  ).toHaveLength(1);
  expect(await history(id)).toHaveLength(1);
}, 30000);

it("独立数据源先提交学校迁移，登记更新失败后按目标历史重试不重复DDL", async () => {
  const id = await register("remote");
  const dir = await directory(initial);
  const success = vi
    .spyOn(MigrationRegistry.prototype, "success")
    .mockRejectedValueOnce(new Error("sensitive-database-url"));
  const result = await migrator.migrateSchool(id, dir);
  success.mockRestore();
  expect(result).toMatchObject({ status: "failed", failureRecorded: true });
  expect(JSON.stringify(result)).not.toContain("sensitive-database-url");
  expect(await history(id, "remote")).toHaveLength(1);
  expect((await state(id)).schema_version).toBe(0);
  expect(await migrator.migrateSchool(id, dir)).toMatchObject({
    status: "active",
    applied: [],
    schemaVersion: 1,
  });
  expect(await state(id)).toMatchObject({
    status: "active",
    schema_version: 1,
    last_error: null,
  });
  expect(
    (
      await sources
        .get()
        .pool.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [
          schoolSchemaName(id),
        ])
    ).rowCount,
  ).toBe(0);
});

it("默认数据源登记失败时DDL和迁移元数据也一起回滚", async () => {
  const id = await register();
  const dir = await directory(initial);
  const success = vi
    .spyOn(MigrationRegistry.prototype, "success")
    .mockRejectedValueOnce(new Error("public-write-failure"));
  expect(await migrator.migrateSchool(id, dir)).toMatchObject({
    status: "failed",
    failureRecorded: true,
  });
  success.mockRestore();
  const tables = await sources
    .get()
    .pool.query("SELECT tablename FROM pg_tables WHERE schemaname=$1", [
      schoolSchemaName(id),
    ]);
  expect(tables.rows).toEqual([]);
  expect(await migrator.migrateSchool(id, dir)).toMatchObject({
    status: "active",
    applied: ["0001_initial.sql"],
  });
});

it("未建库、未知数据源安全失败，非学校/停用/删除及无登记返回404", async () => {
  const dir = await directory(initial);
  const missing = await register("default", "failed", false);
  expect(await migrator.migrateSchool(missing, dir)).toMatchObject({
    status: "failed",
    error: "学校库尚未创建，请重试开通",
  });
  const unknown = await register("unknown", "active", false);
  expect(await migrator.migrateSchool(unknown, dir)).toMatchObject({
    status: "failed",
    failureRecorded: true,
  });
  for (const status of ["provisioning", "suspended", "archived", "destroyed"]) {
    const id = await register("default", status, false);
    await expect(migrator.migrateSchool(id, dir)).rejects.toMatchObject({
      code: 90004,
    });
  }
  for (const statement of [
    "UPDATE public.orgs SET type='company',region_code=NULL WHERE id=$1",
    "UPDATE public.orgs SET status=0 WHERE id=$1",
    "UPDATE public.school_tenants SET deleted_at=now() WHERE school_id=$1",
  ]) {
    const id = await register();
    await sources.get().pool.query(statement, [id]);
    await expect(migrator.migrateSchool(id, dir)).rejects.toMatchObject({
      code: 90004,
    });
  }
  await expect(migrator.migrateSchool(v7(), dir)).rejects.toMatchObject({
    code: 90004,
  });
});

it("真实批量迁移一校失败后其他学校完成，失败校保留可重试名单", async () => {
  const ids = await Promise.all(Array.from({ length: 12 }, () => register()));
  const bad = ids[3] as string;
  const dir = await directory(initial);
  await sources
    .get()
    .pool.query(`CREATE TABLE "${schoolSchemaName(bad)}".probe(id integer)`);
  const repository = new TenantRepository(sources.get().db);
  const candidates = vi
    .spyOn(repository, "migrationCandidates")
    .mockResolvedValue(ids);
  let concurrent = 0;
  let maximum = 0;
  const originalLock = MigrationRegistry.prototype.lock;
  const originalUnlock = MigrationRegistry.prototype.unlock;
  const lock = vi
    .spyOn(MigrationRegistry.prototype, "lock")
    .mockImplementation(async function (this: MigrationRegistry, id: string) {
      concurrent++;
      maximum = Math.max(maximum, concurrent);
      return originalLock.call(this, id);
    });
  const unlock = vi
    .spyOn(MigrationRegistry.prototype, "unlock")
    .mockImplementation(async function (this: MigrationRegistry, id: string) {
      try {
        return await originalUnlock.call(this, id);
      } finally {
        concurrent--;
      }
    });
  const results = await new TenantMigrator(sources, repository).migrateAll({
    directory: dir,
    batchSize: 3,
  });
  lock.mockRestore();
  unlock.mockRestore();
  expect(maximum).toBeLessThanOrEqual(3);
  expect(concurrent).toBe(0);
  candidates.mockRestore();
  expect(results.filter((row) => row.status === "active")).toHaveLength(11);
  expect(results.filter((row) => row.status === "failed")).toEqual([
    expect.objectContaining({ schoolId: bad, failureRecorded: true }),
  ]);
  expect((await state(bad)).status).toBe("failed");
  expect(
    await new TenantRepository(sources.get().db).migrationCandidates(),
  ).toContain(bad);
  await sources.get().pool.query(`DROP TABLE "${schoolSchemaName(bad)}".probe`);
  expect(await migrator.migrateSchool(bad, dir)).toMatchObject({
    status: "active",
  });
});

it("公库无法记录失败时结果明确标识未记录，不泄露原始错误", async () => {
  const id = await register("default", "failed", false);
  const dir = await directory(initial);
  const failure = vi
    .spyOn(MigrationRegistry.prototype, "failure")
    .mockRejectedValueOnce(new Error("secret-connection"));
  const result = await migrator.migrateSchool(id, dir);
  failure.mockRestore();
  expect(result).toMatchObject({ status: "failed", failureRecorded: false });
  expect(JSON.stringify(result)).not.toContain("secret-connection");
});

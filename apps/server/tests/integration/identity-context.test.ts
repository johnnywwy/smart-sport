import type { ServerConfig } from "@smart-sport/config/env";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { Redis } from "ioredis";
import pg from "pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { v7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migratePublic } from "../../src/database/migrate.js";
import { syncCatalog } from "../../src/modules/platform/catalog/catalog-sync.js";
import { ContextRepository } from "../../src/modules/platform/identity-context/context.repository.js";
import { IdentityContextService } from "../../src/modules/platform/identity-context/context.service.js";
import { ContextCache } from "../../src/modules/platform/identity-context/context-cache.js";
import {
  RolesRepository,
  RolesService,
} from "../../src/modules/platform/roles/index.js";
import {
  identities,
  identityRoles,
  organizations,
  users,
} from "../../src/schema/public.js";

let postgres: StartedPostgreSqlContainer;
let redis: StartedTestContainer;
let pool: pg.Pool;
let first: IdentityContextService;
let second: IdentityContextService;
let cache: ContextCache;
let inspector: Redis;
const identityId = v7();
const userId = v7();
const orgId = v7();

beforeAll(async () => {
  [postgres, redis] = await Promise.all([
    new PostgreSqlContainer("postgres:17.11-alpine3.23").start(),
    new GenericContainer("redis:8.10.3-alpine3.23")
      .withExposedPorts(6379)
      .start(),
  ]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await migratePublic(pool);
  await syncCatalog(pool);
  const db = drizzle(pool);
  await db.insert(users).values({
    id: userId,
    username: "context-test",
    realName: "上下文测试",
    passwordHash: "test-only",
  });
  await db
    .insert(organizations)
    .values({ id: orgId, type: "company", name: "测试公司", code: "CTX_TEST" });
  await db
    .insert(identities)
    .values({ id: identityId, userId, orgId, type: "company" });
  const role = await pool.query(
    "SELECT id FROM public.roles WHERE code='company-super-admin'",
  );
  await db
    .insert(identityRoles)
    .values({ identityId, roleId: role.rows[0].id });
  const config = {
    REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
  } as ServerConfig;
  inspector = new Redis(config.REDIS_URL);
  const make = () =>
    new IdentityContextService(
      new ContextRepository(db),
      new RolesService(new RolesRepository(db)),
      config,
    );
  first = make();
  second = make();
  cache = new ContextCache(config.REDIS_URL);
  await Promise.all([
    first.onModuleInit(),
    second.onModuleInit(),
    cache.subscribe(),
  ]);
}, 120000);

afterAll(async () => {
  await first?.onApplicationShutdown();
  await second?.onApplicationShutdown();
  await cache?.close();
  inspector?.disconnect();
  await pool?.end();
  await postgres?.stop();
  await redis?.stop();
}, 30000);

describe("身份上下文与跨实例失效", () => {
  it("加载身份权限并可跨实例从缓存恢复 Map", async () => {
    const context = await first.load(identityId);
    expect(context.permissions.get("school:student:update")).toBe("all");
    expect(context).toMatchObject({
      identityId,
      userId,
      orgId,
      client: "admin",
      identityType: "company",
    });
    expect(await inspector.ttl(`ctx:${identityId}`)).toBeGreaterThan(590);
    const other = await second.load(identityId);
    expect(other.permissions).toEqual(context.permissions);
  });

  it("数据库提交角色停用后另一实例立即拒绝旧缓存权限", async () => {
    await pool.query(
      "UPDATE public.roles SET status=0 WHERE code='company-super-admin'",
    );
    const revision = await new ContextRepository(drizzle(pool)).revision();
    await cache.observeDatabaseRevision(revision);
    await expect.poll(() => inspector.get(`ctx:${identityId}`)).toBeNull();
    const context = await second.load(identityId);
    expect(context.permissions.size).toBe(0);
    await pool.query(
      "UPDATE public.roles SET status=1 WHERE code='company-super-admin'",
    );
    expect((await first.load(identityId)).permissions.size).toBeGreaterThan(0);
  });

  it("版本失效后旧计算结果无法回填", async () => {
    const revision = await cache.revision();
    await second.invalidate([identityId]);
    expect(await cache.write(identityId, `0:${revision}`, {})).toBe(false);
  });

  it("查看和编辑分别取授予该动作的角色范围", async () => {
    await pool.query("DELETE FROM public.identity_roles WHERE identity_id=$1", [
      identityId,
    ]);
    for (const [scope, level] of [
      ["all", "view"],
      ["dept", "edit"],
    ]) {
      const id = v7();
      await pool.query(
        "INSERT INTO public.roles (id,kind,identity_type,org_id,code,name,data_scope,base_role_id) VALUES ($1,'custom','company',$2,$3,$3,$4,(SELECT id FROM public.roles WHERE code='company-super-admin'))",
        [id, orgId, `CTX_${scope}`, scope],
      );
      await pool.query(
        "INSERT INTO public.role_grants (role_id,app_code,feature_code,level) VALUES ($1,'school','student',$2)",
        [id, level],
      );
      await pool.query(
        "INSERT INTO public.identity_roles (identity_id,role_id) VALUES ($1,$2)",
        [identityId, id],
      );
    }
    const context = await second.load(identityId);
    expect(context.permissions.get("school:student:view")).toBe("all");
    expect(context.permissions.get("school:student:update")).toBe("dept");
    expect(context.permissions.has("school:student:delete")).toBe(false);
  });

  it("账号停用提交后缓存不能继续放行", async () => {
    await pool.query("UPDATE public.users SET status=0 WHERE id=$1", [userId]);
    await expect(first.load(identityId)).rejects.toMatchObject({ code: 10005 });
  });
});

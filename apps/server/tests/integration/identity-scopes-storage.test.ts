import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migratePublic } from "../../src/database/migrate.js";
import { identityScopes } from "../../src/schema/public.js";
import { POSTGRES_IMAGE } from "../helpers/postgres-image.js";

let container: StartedPostgreSqlContainer | undefined;
let pool: pg.Pool;
const identityId = v7();

beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await migratePublic(pool);
  const userId = v7();
  const orgId = v7();
  await pool.query(
    "INSERT INTO public.users(id,username,real_name,password_hash) VALUES($1::uuid,$1::text,'范围存储测试','unused')",
    [userId],
  );
  await pool.query(
    "INSERT INTO public.orgs(id,type,name,code) VALUES($1::uuid,'company','范围存储测试',$1::text)",
    [orgId],
  );
  await pool.query(
    "INSERT INTO public.identities(id,user_id,org_id,type) VALUES($1,$2,$3,'company')",
    [identityId, userId, orgId],
  );
}, 120000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
}, 30000);

const revision = async () =>
  BigInt(
    (
      await pool.query<{ version: string }>(
        "SELECT version FROM public.identity_context_revision",
      )
    ).rows[0]?.version ?? "0",
  );

it("重复迁移不再执行，Drizzle 与实际关联表对应", async () => {
  expect(await migratePublic(pool)).toEqual([]);
  const [row] = await drizzle(pool)
    .insert(identityScopes)
    .values({ identityId, scopeType: "region", scopeValue: "330000" })
    .returning();
  expect(row).toEqual({
    identityId,
    scopeType: "region",
    scopeValue: "330000",
  });
});

it("拒绝重复范围、悬挂身份以及不符合类型的值", async () => {
  await expect(
    pool.query(
      "INSERT INTO public.identity_scopes VALUES($1,'region','330000')",
      [identityId],
    ),
  ).rejects.toMatchObject({ code: "23505" });
  await expect(
    pool.query(
      "INSERT INTO public.identity_scopes VALUES($1,'region','330100')",
      [v7()],
    ),
  ).rejects.toMatchObject({ code: "23503" });
  for (const [type, value] of [
    ["class", v7()],
    ["school", "not-a-uuid"],
    ["college", "unknown"],
    ["region", "33000"],
    ["grade", "17"],
  ])
    await expect(
      pool.query("INSERT INTO public.identity_scopes VALUES($1,$2,$3)", [
        identityId,
        type,
        value,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
});

it("范围增改删提交均推进缓存屏障，事务回滚不会残留范围或版本", async () => {
  const before = await revision();
  await pool.query(
    "INSERT INTO public.identity_scopes VALUES($1,'region','330100')",
    [identityId],
  );
  expect(await revision()).toBe(before + 1n);
  await pool.query(
    "UPDATE public.identity_scopes SET scope_value='330106' WHERE identity_id=$1 AND scope_value='330100'",
    [identityId],
  );
  expect(await revision()).toBe(before + 2n);
  await pool.query(
    "DELETE FROM public.identity_scopes WHERE identity_id=$1 AND scope_value='330106'",
    [identityId],
  );
  expect(await revision()).toBe(before + 3n);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO public.identity_scopes VALUES($1,'region','330200')",
      [identityId],
    );
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
  expect(await revision()).toBe(before + 3n);
  expect(
    (
      await pool.query(
        "SELECT 1 FROM public.identity_scopes WHERE identity_id=$1 AND scope_value='330200'",
        [identityId],
      )
    ).rowCount,
  ).toBe(0);
});

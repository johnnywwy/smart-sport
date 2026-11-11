import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migratePublic } from "../../src/database/migrate.js";
import { syncCatalog } from "../../src/modules/platform/catalog/catalog-sync.js";

let container: StartedPostgreSqlContainer | undefined;
let pool: pg.Pool;

beforeAll(async () => {
  container = await new PostgreSqlContainer(
    "postgres:17.11-alpine3.23",
  ).start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await migratePublic(pool);
}, 120000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
}, 30000);

describe("应用目录与内置角色同步", () => {
  it("首次与重复同步结果一致且无重复数据", async () => {
    const first = await syncCatalog(pool);
    const second = await syncCatalog(pool);
    expect(first).toEqual(second);
    expect(first).toEqual({
      apps: 5,
      features: 26,
      menus: 26,
      roles: 16,
      grants: expect.any(Number),
    });
    const counts = await pool.query<{
      apps: number;
      features: number;
      menus: number;
      roles: number;
      grants: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM public.apps) apps,
        (SELECT count(*)::int FROM public.features) features,
        (SELECT count(*)::int FROM public.menus) menus,
        (SELECT count(*)::int FROM public.roles WHERE kind='preset') roles,
        (SELECT count(*)::int FROM public.role_grants) grants`,
    );
    expect(counts.rows[0]).toEqual(first);
  });

  it("同步恢复代码字段但不覆盖菜单显示设置", async () => {
    await pool.query(
      `INSERT INTO public.menu_overrides (app_code,menu_key,display_name,sort,icon,hidden)
       VALUES ('school','student','学生花名册',3,'custom-icon',true)`,
    );
    await pool.query(
      "UPDATE public.menus SET name='被篡改的名称',status=0 WHERE app_code='school' AND key='student'",
    );
    await syncCatalog(pool);
    const menu = await pool.query(
      "SELECT name,status FROM public.menus WHERE app_code='school' AND key='student'",
    );
    const override = await pool.query(
      "SELECT display_name,sort,icon,hidden FROM public.menu_overrides WHERE app_code='school' AND menu_key='student'",
    );
    expect(menu.rows[0]).toEqual({ name: "学生", status: 1 });
    expect(override.rows[0]).toEqual({
      display_name: "学生花名册",
      sort: 3,
      icon: "custom-icon",
      hidden: true,
    });
  });

  it("声明外的目录记录标记停用，删除的内置授权会被清理", async () => {
    await pool.query(
      `INSERT INTO public.apps (code,name,description,icon,identity_types,sort) VALUES ('retired','旧应用','旧应用','box',ARRAY['company'],999);
       INSERT INTO public.features (app_code,code,name,actions) VALUES ('retired','old','旧功能',ARRAY['view']);
       INSERT INTO public.menus (app_code,key,name,path,feature_code,sort) VALUES ('retired','old','旧菜单','/old','old',1)`,
    );
    const role = await pool.query<{ id: string }>(
      "SELECT id FROM public.roles WHERE code='company-sales'",
    );
    await pool.query(
      "INSERT INTO public.role_grants (role_id,app_code,feature_code,level) VALUES ($1,'system','dict','view')",
      [role.rows[0]?.id],
    );
    await syncCatalog(pool);
    expect(
      (await pool.query("SELECT status FROM public.apps WHERE code='retired'"))
        .rows[0],
    ).toEqual({ status: 0 });
    expect(
      (
        await pool.query(
          "SELECT count(*)::int count FROM public.role_grants WHERE role_id=$1 AND app_code='system'",
          [role.rows[0]?.id],
        )
      ).rows[0],
    ).toEqual({ count: 0 });
  });
});

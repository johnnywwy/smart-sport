import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { v7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migratePublic } from "../../src/database/migrate.js";
import { syncCatalog } from "../../src/modules/platform/catalog/catalog-sync.js";
import { RolesRepository } from "../../src/modules/platform/roles/roles.repository.js";
import { RolesService } from "../../src/modules/platform/roles/roles.service.js";
import {
  organizations,
  regions,
  roleGrants,
  roles,
} from "../../src/schema/public.js";

let container: StartedPostgreSqlContainer | undefined;
let pool: pg.Pool;
let service: RolesService;

beforeAll(async () => {
  container = await new PostgreSqlContainer(
    "postgres:17.11-alpine3.23",
  ).start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await migratePublic(pool);
  await syncCatalog(pool);
  service = new RolesService(new RolesRepository(drizzle(pool)));
}, 120000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
}, 30000);

describe("角色最终档位", () => {
  it("内置角色直接返回代码同步的授权", async () => {
    const preset = await pool.query<{ id: string }>(
      "SELECT id FROM public.roles WHERE code='teacher-pe'",
    );
    const grants = await service.resolve([preset.rows[0]?.id ?? ""]);
    expect(
      grants.map(({ app, feature, grant }) => ({ app, feature, grant })),
    ).toEqual([
      { app: "school", feature: "class", grant: { level: "view" } },
      { app: "school", feature: "student", grant: { level: "view" } },
      {
        app: "school",
        feature: "teaching-class",
        grant: { level: "view" },
      },
    ]);
  });

  it("自定义角色仅覆盖差异，基础角色新增模块后自动继承", async () => {
    const db = drizzle(pool);
    await db.insert(regions).values([
      {
        code: "110000",
        name: "测试省",
        level: 1,
        path: "110000",
      },
      {
        code: "110100",
        name: "测试市",
        level: 2,
        parentCode: "110000",
        path: "110000.110100",
      },
      {
        code: "110101",
        name: "测试区",
        level: 3,
        parentCode: "110100",
        path: "110000.110100.110101",
      },
    ]);
    const [org] = await db
      .insert(organizations)
      .values({
        id: v7(),
        type: "school",
        name: "角色测试学校",
        code: "ORG_ROLE_TEST",
        regionCode: "110101",
      })
      .returning();
    const preset = await pool.query<{ id: string }>(
      "SELECT id FROM public.roles WHERE code='teacher-pe'",
    );
    const [custom] = await db
      .insert(roles)
      .values({
        id: v7(),
        kind: "custom",
        baseRoleId: preset.rows[0]?.id,
        identityType: "teacher",
        orgId: org?.id,
        code: "ROLE_CUSTOM_TEST",
        name: "自定义教师",
        dataScope: "personal",
      })
      .returning();
    await db.insert(roleGrants).values({
      roleId: custom?.id ?? "",
      appCode: "school",
      featureCode: "student",
      level: "edit",
    });
    expect(await service.resolve([custom?.id ?? ""])).toContainEqual({
      roleId: custom?.id,
      scope: "personal",
      app: "school",
      feature: "student",
      grant: { level: "edit" },
    });
    await pool.query(
      "INSERT INTO public.role_grants (role_id,app_code,feature_code,level) VALUES ($1,'school','teacher','view')",
      [preset.rows[0]?.id],
    );
    expect(await service.resolve([custom?.id ?? ""])).toContainEqual({
      roleId: custom?.id,
      scope: "personal",
      app: "school",
      feature: "teacher",
      grant: { level: "view" },
    });
    const stored = await pool.query(
      "SELECT app_code,feature_code,level FROM public.role_grants WHERE role_id=$1",
      [custom?.id],
    );
    expect(stored.rows).toEqual([
      { app_code: "school", feature_code: "student", level: "edit" },
    ]);
  });
  it("停用角色不再提供授权", async () => {
    const preset = await pool.query<{ id: string }>(
      "SELECT id FROM public.roles WHERE code='company-production'",
    );
    const id = preset.rows[0]?.id ?? "";
    expect((await service.resolve([id])).length).toBeGreaterThan(0);
    await pool.query("UPDATE public.roles SET status=0 WHERE id=$1", [id]);
    expect(await service.resolve([id])).toEqual([]);
  });
  it("模板覆盖处于代码默认与自定义差异之间，范围不串用且可恢复", async () => {
    const preset = (
      await pool.query<{ id: string }>(
        "SELECT id FROM public.roles WHERE code='teacher-pe'",
      )
    ).rows[0];
    const custom = (
      await pool.query<{ id: string }>(
        "SELECT id FROM public.roles WHERE code='ROLE_CUSTOM_TEST'",
      )
    ).rows[0];
    await pool.query(
      `INSERT INTO public.preset_role_overrides(role_id,data_scope,grants) VALUES($1,'dept',$2)`,
      [
        preset?.id,
        JSON.stringify([
          { app: "school", feature: "class", grant: { level: "edit" } },
          { app: "school", feature: "student", grant: { level: "none" } },
        ]),
      ],
    );
    const presetResult = await service.resolve([preset?.id ?? ""]);
    expect(presetResult).toContainEqual({
      roleId: preset?.id,
      scope: "dept",
      app: "school",
      feature: "class",
      grant: { level: "edit" },
    });
    expect(presetResult).toContainEqual({
      roleId: preset?.id,
      scope: "dept",
      app: "school",
      feature: "student",
      grant: { level: "none" },
    });
    const customResult = await service.resolve([custom?.id ?? ""]);
    expect(customResult).toContainEqual({
      roleId: custom?.id,
      scope: "personal",
      app: "school",
      feature: "class",
      grant: { level: "edit" },
    });
    expect(customResult).toContainEqual({
      roleId: custom?.id,
      scope: "personal",
      app: "school",
      feature: "student",
      grant: { level: "edit" },
    });
    await syncCatalog(pool);
    expect(await service.resolve([custom?.id ?? ""])).toContainEqual({
      roleId: custom?.id,
      scope: "personal",
      app: "school",
      feature: "class",
      grant: { level: "edit" },
    });
    await pool.query(
      "DELETE FROM public.preset_role_overrides WHERE role_id=$1",
      [preset?.id],
    );
    expect(await service.resolve([preset?.id ?? ""])).toContainEqual({
      roleId: preset?.id,
      scope: "personal",
      app: "school",
      feature: "class",
      grant: { level: "view" },
    });
  });
  it("超级管理员不接受异常模板覆盖", async () => {
    const preset = (
      await pool.query<{ id: string }>(
        "SELECT id FROM public.roles WHERE code='company-super-admin'",
      )
    ).rows[0];
    await pool.query(
      `INSERT INTO public.preset_role_overrides(role_id,data_scope,grants) VALUES($1,'personal',$2)`,
      [
        preset?.id,
        JSON.stringify([
          { app: "system", feature: "preset-role", grant: { level: "none" } },
        ]),
      ],
    );
    expect(await service.resolve([preset?.id ?? ""])).toContainEqual({
      roleId: preset?.id,
      scope: "all",
      app: "system",
      feature: "preset-role",
      grant: { level: "manage" },
    });
  });
});

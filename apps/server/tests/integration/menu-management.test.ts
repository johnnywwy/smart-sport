import {
  type MenuOverride,
  menuOverrideListSchema,
  menuOverridesSavedSchema,
  moduleMenusSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { syncCatalog } from "../../src/modules/platform/catalog/catalog-sync.js";
import { MenuManagementRepository } from "../../src/modules/platform/navigation/index.js";
import { roleManagementFixture } from "../helpers/role-management.js";

let f: Awaited<ReturnType<typeof roleManagementFixture>>;
beforeAll(async () => {
  f = await roleManagementFixture();
}, 120000);
afterAll(async () => {
  await f?.stop();
}, 30000);
async function list(module = "base", token = f.admin.token, query = "") {
  const r = await f.request(
    `/menus/overrides?module=${module}&pageSize=100${query}`,
    "GET",
    undefined,
    token,
  );
  expect(r.status).toBe(200);
  return successResponseSchema(menuOverrideListSchema).parse(await r.json())
    .data;
}
async function row(key = "departments", module = "base") {
  const r = (await list(module)).items.find((row) => row.key === key);
  if (!r) throw new Error("缺少菜单");
  return r;
}
function change(r: MenuOverride, extra = {}) {
  return {
    module: r.module,
    key: r.key,
    displayName: r.displayName,
    sort: r.sort,
    hidden: r.hidden,
    version: r.version,
    ...extra,
  };
}
async function save(items: ReturnType<typeof change>[], token = f.admin.token) {
  return f.request("/menus/overrides", "PATCH", { items }, token);
}
async function current(module = "base") {
  const r = await f.request(`/menus/current?module=${module}`);
  expect(r.status).toBe(200);
  return successResponseSchema(moduleMenusSchema)
    .parse(await r.json())
    .data.flatMap((g) => g.children);
}
async function snapshot() {
  return (
    await f.pool.query(
      "SELECT * FROM menu_overrides ORDER BY app_code,menu_key",
    )
  ).rows;
}
it("按模块查询声明目录与真实能力，分页、查询和工作台排除", async () => {
  expect((await list()).total).toBe(12);
  expect((await list("platform-admin")).total).toBe(11);
  expect(
    (await list()).items.every((r) => r.allowedActions.includes("update")),
  ).toBe(true);
  expect((await list()).items.some((r) => r.key === "colleges")).toBe(true);
  expect((await list("base", undefined, "&keyword=院系")).total).toBe(1);
  expect((await list("base", undefined, "&keyword=%25")).total).toBe(0);
  const response = await f.request(
    "/menus/overrides?module=base&pageSize=2&page=2",
  );
  expect(
    successResponseSchema(menuOverrideListSchema).parse(await response.json())
      .data,
  ).toMatchObject({
    total: 12,
    page: 2,
    pageSize: 2,
    items: expect.any(Array),
  });
});
it("改名、顺序、显隐即时反映实际导航，聚合菜单所有来源同步且部署不覆盖", async () => {
  const r = await row("classes");
  const response = await save([
    change(r, { displayName: "班级资料", sort: 10 }),
  ]);
  expect(response.status).toBe(200);
  const saved = successResponseSchema(menuOverridesSavedSchema).parse(
    await response.json(),
  ).data[0];
  expect(saved).toMatchObject({
    displayName: "班级资料",
    sort: 10,
    version: 2,
  });
  expect((await current()).find((r) => r.key === "classes")).toMatchObject({
    name: "班级资料",
    sort: 10,
  });
  // 10 正好等于旧目录默认顺序，也必须保留显式覆盖。
  const before = await snapshot();
  await syncCatalog(f.pool);
  expect(await snapshot()).toEqual(before);
  expect(
    (await save([change(await row("classes"), { hidden: true })])).status,
  ).toBe(200);
  expect((await current()).some((r) => r.key === "classes")).toBe(false);
  expect(
    (
      await save([
        change(await row("classes"), {
          displayName: "班级管理",
          sort: 30,
          hidden: false,
        }),
      ])
    ).status,
  ).toBe(200);
  expect((await current()).find((r) => r.key === "classes")?.name).toBe(
    "班级管理",
  );
});
it("未知菜单、伪造工作台与越范围模块拒绝；非法字段、名称、版本不写入", async () => {
  const r = await row();
  const before = await snapshot();
  for (const extra of [{ key: "workbench" }, { key: "unknown" }])
    expect((await save([change(r, extra)])).status).toBe(404);
  for (const extra of [
    { icon: "x" },
    { displayName: " " },
    { sort: -1 },
    { sort: 1.5 },
    { version: undefined },
    { groupKey: "x" },
  ])
    expect((await save([change(r, extra)])).status).toBe(400);
  expect((await save([change(r), change(r)])).status).toBe(400);
  expect(await snapshot()).toEqual(before);
});
it("批量排序原子提交，任一行冲突或审计失败全部回滚，同版本并发只成功一次", async () => {
  const a = await row(),
    b = await row("members");
  const responses = await Promise.all([
    save([change(a, { sort: 20 }), change(b, { sort: 10 })]),
    save([change(a, { displayName: "并发名称" })]),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const before = await snapshot();
  expect(
    (await save([change(await row("members"), { sort: 99 }), change(a)]))
      .status,
  ).toBe(409);
  expect(await snapshot()).toEqual(before);
  const repository = f.app.get(MenuManagementRepository);
  const spy = vi
    .spyOn(repository, "audit")
    .mockRejectedValue(new Error("审计故障"));
  try {
    expect(
      (await save([change(await row(), { displayName: "不应保存" })])).status,
    ).toBe(500);
  } finally {
    spy.mockRestore();
  }
  expect(await snapshot()).toEqual(before);
  expect(
    (
      await f.pool.query(
        "SELECT * FROM audit_logs WHERE action='system.menu.update'",
      )
    ).rowCount,
  ).toBeGreaterThan(0);
});
it("真实角色同一令牌撤权与授权立即生效，只读无修改能力，学校身份不能管理", async () => {
  const actor = await f.seed("company", null, f.admin.orgId),
    roleId = v7();
  await f.pool.query(
    `INSERT INTO roles(id,kind,identity_type,org_id,code,name,data_scope,base_role_id) SELECT $1,'custom','company',$2,$1::uuid::text,'菜单测试角色','all',id FROM roles WHERE code='company-super-admin'`,
    [roleId, actor.orgId],
  );
  await f.pool.query(
    `INSERT INTO role_grants(role_id,app_code,feature_code,level,actions) SELECT $1,app_code,code,CASE WHEN app_code='system' AND code='menu' THEN 'custom' ELSE 'none' END,CASE WHEN app_code='system' AND code='menu' THEN ARRAY['view'] ELSE NULL END FROM features`,
    [roleId],
  );
  await f.pool.query("INSERT INTO identity_roles VALUES($1,$2)", [
    actor.identityId,
    roleId,
  ]);
  const r = await row();
  expect(
    (await list("base", actor.token)).items.every(
      (r) => !r.allowedActions.length,
    ),
  ).toBe(true);
  expect((await save([change(r)], actor.token)).status).toBe(403);
  const detail = await f.detail(roleId);
  const grants = detail.grants.map(({ app, feature, grant }) => ({
    app,
    feature,
    grant:
      app === "system" && feature === "menu"
        ? { level: "custom", actions: ["view", "update"] }
        : grant,
  }));
  expect(
    (
      await f.request(`/roles/${roleId}/grants`, "PUT", {
        version: detail.version,
        dataScope: detail.dataScope,
        grants,
      })
    ).status,
  ).toBe(200);
  expect((await save([change(r)], actor.token)).status).toBe(200);
  const updated = await f.detail(roleId);
  expect(
    (
      await f.request(`/roles/${roleId}/grants`, "PUT", {
        version: updated.version,
        dataScope: updated.dataScope,
        grants: grants.map((g) =>
          g.app === "system" && g.feature === "menu"
            ? { ...g, grant: { level: "none" } }
            : g,
        ),
      })
    ).status,
  ).toBe(200);
  const before = await snapshot();
  expect((await save([change(await row())], actor.token)).status).toBe(403);
  expect(
    (
      await f.request(
        "/menus/overrides?module=base",
        "GET",
        undefined,
        actor.token,
      )
    ).status,
  ).toBe(403);
  const school = await f.seed("school", "school-admin");
  expect((await save([change(await row())], school.token)).status).toBe(403);
  expect(
    (
      await f.request(
        "/menus/overrides?module=base",
        "GET",
        undefined,
        school.token,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await f.request(
        "/menus/overrides?module=base",
        "GET",
        undefined,
        f.admin.account,
      )
    ).status,
  ).toBe(401);
  expect(await snapshot()).toEqual(before);
});

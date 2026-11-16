import {
  identityVisibleSchema,
  scopePreviewSchema,
  scopeSchoolsSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  ScopeQueryRepository,
  ScopeRepository,
  ScopeService,
} from "../../src/modules/platform/scope/index.js";
import { roleInput } from "../helpers/role-management.js";
import { scopeFixture } from "../helpers/scope.js";

let f: Awaited<ReturnType<typeof scopeFixture>>;
beforeAll(async () => {
  f = await scopeFixture();
}, 120000);
afterAll(async () => {
  await f?.stop();
}, 30000);
const list = async (token = f.admin.token, query = "") => {
  const r = await f.request(`/scope/schools${query}`, "GET", undefined, token);
  expect(r.status).toBe(200);
  return successResponseSchema(scopeSchoolsSchema).parse(await r.json()).data;
};
const visible = async (id: string, query = "", token = f.admin.token) => {
  const r = await f.request(
    `/identities/${id}/visible${query}`,
    "GET",
    undefined,
    token,
  );
  expect(r.status).toBe(200);
  return successResponseSchema(identityVisibleSchema).parse(await r.json())
    .data;
};
const preview = async (body: unknown, token = f.admin.token) => {
  const r = await f.request("/scope/preview", "POST", body, token);
  expect(r.status).toBe(200);
  return successResponseSchema(scopePreviewSchema).parse(await r.json()).data;
};
const step = (result: Awaited<ReturnType<typeof visible>>, kind: string) =>
  result.steps.find((s) => s.kind === kind)?.schoolCount;

it("学校选择入口仍验证登录、身份和动态动作权限，拒绝未声明参数", async () => {
  expect((await f.request("/scope/schools", "GET", undefined, "")).status).toBe(
    401,
  );
  expect(
    (await f.request("/scope/schools", "GET", undefined, f.admin.account))
      .status,
  ).toBe(401);
  const noRole = await f.seed("company", null, f.admin.orgId);
  expect(
    (await f.request("/scope/schools", "GET", undefined, noRole.token)).status,
  ).toBe(403);
  expect(
    (
      await f.request(
        "/scope/preview",
        "POST",
        { mode: "selection", scopes: [] },
        noRole.token,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await f.request(
        `/identities/${f.admin.identityId}/visible`,
        "GET",
        undefined,
        noRole.token,
      )
    ).status,
  ).toBe(403);
  for (const query of [
    "permission=org:member:view",
    "permission=school:student:fake",
    "pageSize=101",
    `orgId=${f.admin.orgId}`,
  ])
    expect((await f.request(`/scope/schools?${query}`)).status).toBe(400);
});

it("公司学校列表与实际可见数量一致，停用删除及失效区划学校均不可见", async () => {
  const active = await f.school();
  const disabled = await f.school();
  const deleted = await f.school();
  const invalidRegion = await f.school("980000");
  await f.pool.query("UPDATE public.orgs SET status=0 WHERE id=$1", [disabled]);
  await f.pool.query("UPDATE public.orgs SET deleted_at=now() WHERE id=$1", [
    deleted,
  ]);
  await f.pool.query("UPDATE public.regions SET status=0 WHERE code='980000'");
  const schools = await list();
  const actual = await visible(f.admin.identityId);
  expect(actual.schoolCount).toBe(schools.total);
  expect(actual.total).toBe(schools.total);
  expect(schools.items.map((s) => s.id)).toContain(active);
  for (const id of [disabled, deleted, invalidRegion])
    expect(schools.items.map((s) => s.id)).not.toContain(id);
  expect(schools.items[0]?.allowedActions).toEqual(["view", "export"]);
  expect(step(actual, "visible")).toBe(actual.total);
  await f.pool.query("UPDATE public.regions SET status=1 WHERE code='980000'");
});

it("名称排序分页稳定，关键字按字面处理百分号下划线，搜索不冒充全量可见数", async () => {
  const ids = await Promise.all([f.school(), f.school(), f.school()]);
  for (const [index, id] of ids.entries())
    await f.pool.query("UPDATE public.orgs SET name=$2 WHERE id=$1", [
      id,
      `范围分页%_学校${index}`,
    ]);
  const schools = await list(f.admin.token, "?keyword=%25_&page=2&pageSize=2");
  expect(schools).toMatchObject({ total: 3, page: 2, pageSize: 2 });
  expect(schools.items.map((s) => s.id)).toEqual([ids[2]]);
  const actual = await visible(f.admin.identityId, "?keyword=%25_");
  expect(actual.total).toBe(3);
  expect(actual.schoolCount).toBeGreaterThan(3);
  expect((await list(f.admin.token, "?page=100&pageSize=2")).items).toEqual([]);
});

it("查看全量、修改本部门独立计算，行权限不会借用查看档位", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  const dept = await f.department();
  const inside = await f.school(),
    outside = await f.school();
  await f.assign(actor.identityId, dept.id);
  await f.responsibility(dept.id, "school", inside);
  const broad = await f.role(actor.identityId, actor.orgId, "all", "view");
  const narrow = await f.role(actor.identityId, actor.orgId, "dept", "edit");
  const schools = await list(
    actor.token,
    "?permission=school:student:view&pageSize=100",
  );
  expect(schools.items.find((s) => s.id === inside)?.allowedActions).toEqual([
    "view",
    "create",
    "update",
  ]);
  expect(schools.items.find((s) => s.id === outside)?.allowedActions).toEqual([
    "view",
  ]);
  const updates = await list(actor.token, "?permission=school:student:update");
  expect(updates.total).toBe(1);
  expect(updates.items[0]?.id).toBe(inside);
  const actual = await visible(
    actor.identityId,
    "?permission=school:student:update",
  );
  expect(actual).toMatchObject({
    schoolCount: 1,
    total: 1,
    dataScope: "dept",
    roles: [{ id: narrow, dataScope: "dept" }],
  });
  expect(actual.roles.map((r) => r.id)).not.toContain(broad);
});

it("计算过程显示下级部门与本人额外负责去重，列表和数量使用相同范围", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  const dept = await f.department(),
    child = await f.department(undefined, dept);
  const a = await f.school(),
    b = await f.school();
  await f.assign(actor.identityId, dept.id);
  await f.responsibility(dept.id, "school", a);
  await f.responsibility(child.id, "school", b);
  await f.personal(actor.identityId, "school", a);
  await f.role(actor.identityId, actor.orgId, "dept_and_below");
  const result = await visible(
    actor.identityId,
    "?permission=school:student:view",
  );
  expect(result).toMatchObject({
    schoolCount: 2,
    total: 2,
    dataScope: "dept_and_below",
    warnings: [],
  });
  expect(step(result, "department")).toBe(2);
  expect(step(result, "personal")).toBe(1);
  expect(step(result, "union")).toBe(2);
  expect(new Set(result.items.map((s) => s.id))).toEqual(new Set([a, b]));
  expect(
    (await list(actor.token, "?permission=school:student:view")).total,
  ).toBe(result.schoolCount);
});

it("教育局实际结果与预览受目标辖区限制，污染的额外范围不泄露外部学校", async () => {
  const bureau = await f.seed("bureau", "bureau-admin");
  await f.pool.query(
    "UPDATE public.orgs SET region_code='990100' WHERE id=$1",
    [bureau.orgId],
  );
  const inside = await f.school(),
    outside = await f.school("990200");
  await f.personal(bureau.identityId, "school", outside);
  const result = await visible(
    bureau.identityId,
    `?orgId=${bureau.orgId}`,
    f.admin.token,
  );
  expect(result.items.map((s) => s.id)).toContain(inside);
  expect(result.items.map((s) => s.id)).not.toContain(outside);
  expect(step(result, "personal")).toBe(0);
  expect((await list(bureau.token)).total).toBe(result.schoolCount);
  for (const scopes of [
    [{ type: "school", value: outside }],
    [{ type: "region", value: "990000" }],
  ]) {
    expect(
      (
        await f.request("/scope/preview", "POST", {
          mode: "selection",
          orgId: bureau.orgId,
          scopes,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await f.request(
          "/scope/preview",
          "POST",
          { mode: "selection", scopes },
          bureau.token,
        )
      ).status,
    ).toBe(404);
  }
});

it("选择预览对重叠区划和学校去重，不改变版本、范围或审计", async () => {
  const before = await f.pool.query(
    "SELECT version FROM public.identities WHERE id=$1",
    [f.admin.identityId],
  );
  const audit = await f.pool.query("SELECT count(*) FROM public.audit_logs");
  const school = await f.school();
  const all = await preview({
    mode: "selection",
    scopes: [{ type: "region", value: "990100" }],
  });
  const overlap = await preview({
    mode: "selection",
    scopes: [
      { type: "region", value: "990100" },
      { type: "region", value: "990101" },
      { type: "school", value: school },
    ],
  });
  expect(overlap).toMatchObject({
    supported: true,
    dataScope: null,
    schoolCount: all.schoolCount,
  });
  expect((await preview({ mode: "selection", scopes: [] })).schoolCount).toBe(
    0,
  );
  expect(
    (
      await f.pool.query("SELECT version FROM public.identities WHERE id=$1", [
        f.admin.identityId,
      ])
    ).rows,
  ).toEqual(before.rows);
  expect(
    (await f.pool.query("SELECT count(*) FROM public.audit_logs")).rows,
  ).toEqual(audit.rows);
});

it("身份草稿复用真实角色最终档位，部门和本人选择可预览但不落库", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  const dept = await f.department(),
    school = await f.school();
  const roleId = await f.role(actor.identityId, actor.orgId, "dept");
  await f.responsibility(dept.id, "school", school);
  const input = {
    mode: "identity",
    roleIds: [roleId],
    departmentId: dept.id,
    scopes: [{ type: "school", value: school }],
    permission: "school:student:view",
  };
  const result = await preview(input);
  expect(result).toMatchObject({
    schoolCount: 1,
    dataScope: "dept",
    warnings: [],
  });
  const actual = await visible(
    actor.identityId,
    "?permission=school:student:view",
  );
  expect(actual).toMatchObject({
    schoolCount: 0,
    warnings: ["missing_department"],
  });
  await f.assign(actor.identityId, dept.id);
  expect(
    (await visible(actor.identityId, "?permission=school:student:view"))
      .schoolCount,
  ).toBe(result.schoolCount);
  expect(
    (
      await f.pool.query(
        "SELECT * FROM public.identity_scopes WHERE identity_id=$1",
        [actor.identityId],
      )
    ).rows,
  ).toEqual([]);
});

it("成员查询不能跨组织，预览拒绝其他组织的部门角色和不存在选择", async () => {
  const own = await f.seed("company", "company-super-admin", f.admin.orgId);
  const other = await f.seed("company", null);
  const role = await f.role(other.identityId, other.orgId, "all");
  const dept = await f.department(other.orgId);
  expect(
    (
      await f.request(
        `/identities/${other.identityId}/visible`,
        "GET",
        undefined,
        own.token,
      )
    ).status,
  ).toBe(404);
  const bureau = await f.seed("bureau", "bureau-admin");
  expect(
    (
      await f.request(
        `/identities/${other.identityId}/visible?orgId=${other.orgId}`,
        "GET",
        undefined,
        bureau.token,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await visible(
        other.identityId,
        `?orgId=${other.orgId}&permission=school:student:view`,
      )
    ).supported,
  ).toBe(true);
  for (const body of [
    { mode: "identity", roleIds: [role], departmentId: null, scopes: [] },
    { mode: "identity", roleIds: [], departmentId: dept.id, scopes: [] },
    { mode: "selection", scopes: [{ type: "school", value: v7() }] },
    { mode: "selection", scopes: [{ type: "region", value: "123456" }] },
  ])
    expect((await f.request("/scope/preview", "POST", body)).status).toBe(404);
});

it("预览只能使用操作人有权授予的角色，不能凭查看角色功能预览更宽权限", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  const limited = await f.role(actor.identityId, actor.orgId, "personal");
  await f.pool.query(
    "UPDATE public.role_grants SET level='view' WHERE role_id=$1 AND app_code='org' AND feature_code='role'",
    [limited],
  );
  const broadActor = await f.seed("company", null, f.admin.orgId);
  const broad = await f.role(broadActor.identityId, broadActor.orgId, "all");
  const input = {
    mode: "identity",
    roleIds: [broad],
    departmentId: null,
    scopes: [],
    permission: "school:student:view",
  };
  expect(
    (await f.request("/scope/preview", "POST", input, actor.token)).status,
  ).toBe(403);
  expect(
    (await preview({ ...input, roleIds: [limited] }, actor.token)).dataScope,
  ).toBe("personal");
});

it("额外范围不授予缺失动作，无部门和未开放身份给出明确空结果", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  await f.personal(actor.identityId, "school", await f.school());
  const result = await visible(
    actor.identityId,
    "?permission=school:student:view",
  );
  expect(result).toMatchObject({
    total: 0,
    schoolCount: 0,
    dataScope: null,
    warnings: ["permission_not_granted"],
  });
  for (const [type, code] of [
    ["agent", "agent-admin"],
    ["school", "school-admin"],
  ] as const) {
    const target = await f.seed(type, code);
    expect(
      await visible(
        target.identityId,
        `?orgId=${target.orgId}&permission=school:student:view`,
      ),
    ).toMatchObject({
      supported: false,
      total: 0,
      warnings: ["unsupported_identity"],
    });
    expect(
      (
        await f.request("/scope/preview", "POST", {
          mode: "selection",
          orgId: target.orgId,
          scopes: [{ type: "region", value: "990000" }],
        })
      ).status,
    ).toBe(422);
  }
  expect(
    (
      await f.request("/scope/preview", "POST", {
        mode: "selection",
        scopes: [{ type: "grade", value: "23" }],
      })
    ).status,
  ).toBe(422);
});

it("真实本人范围写接口提交后，可见数量、列表和旧缓存同时更新", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  await f.role(actor.identityId, actor.orgId, "personal");
  const school = await f.school();
  const query = "?permission=school:student:view";
  expect((await list(actor.token, query)).total).toBe(0);
  expect(
    (
      await f.request(`/identities/${actor.identityId}/scopes`, "PUT", {
        version: 0,
        scopes: [{ type: "school", value: school }],
      })
    ).status,
  ).toBe(200);
  expect((await list(actor.token, query)).total).toBe(1);
  expect((await visible(actor.identityId, query)).schoolCount).toBe(1);
  expect(
    (
      await f.request(`/identities/${actor.identityId}/scopes`, "PUT", {
        version: 1,
        scopes: [],
      })
    ).status,
  ).toBe(200);
  expect((await visible(actor.identityId, query)).schoolCount).toBe(0);
  expect((await list(actor.token, query)).items).toEqual([]);
});

it("读取列表期间撤权不能返回旧学校或旧行操作", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  const role = await f.role(actor.identityId, actor.orgId, "all");
  const repo = f.app.get(ScopeQueryRepository);
  const original = repo.schools.bind(repo);
  let reached!: () => void, release!: () => void;
  const ready = new Promise<void>((r) => {
    reached = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const spy = vi
    .spyOn(repo, "schools")
    .mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      reached();
      await gate;
      return result;
    });
  try {
    const request = f.request(
      "/scope/schools?permission=school:student:view",
      "GET",
      undefined,
      actor.token,
    );
    await ready;
    await f.pool.query(
      "UPDATE public.role_grants SET level='none' WHERE role_id=$1",
      [role],
    );
    release();
    expect((await request).status).toBe(403);
  } finally {
    release();
    spy.mockRestore();
  }
});

it("读取计算过程期间移除本人范围，最终不能返回先前学校明细", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  await f.role(actor.identityId, actor.orgId, "personal");
  await f.personal(actor.identityId, "school", await f.school());
  const repo = f.app.get(ScopeRepository),
    original = repo.personalSelections.bind(repo);
  let reached!: () => void, release!: () => void;
  const ready = new Promise<void>((r) => {
      reached = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  const spy = vi
    .spyOn(repo, "personalSelections")
    .mockImplementationOnce(async (id) => {
      const result = await original(id);
      reached();
      await gate;
      return result;
    });
  try {
    const request = f.request(
      `/identities/${actor.identityId}/visible?permission=school:student:view`,
    );
    await ready;
    await f.pool.query(
      "DELETE FROM public.identity_scopes WHERE identity_id=$1",
      [actor.identityId],
    );
    release();
    const response = await request;
    expect(response.status).toBe(200);
    expect(
      successResponseSchema(identityVisibleSchema).parse(await response.json())
        .data,
    ).toMatchObject({ schoolCount: 0, total: 0, items: [] });
  } finally {
    release();
    spy.mockRestore();
  }
});

it("真实角色修改接口改变范围并撤销动作后，同一令牌不能继续读取学校", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  const roleId = await f.role(actor.identityId, actor.orgId, "personal");
  const query = "?permission=school:student:view";
  expect((await list(actor.token, query)).total).toBe(0);
  const update = roleInput(await f.detail(roleId));
  update.dataScope = "all";
  expect(
    (await f.request(`/roles/${roleId}/grants`, "PUT", update)).status,
  ).toBe(200);
  const broad = await list(actor.token, query);
  expect(broad.total).toBeGreaterThan(0);
  expect((await visible(actor.identityId, query)).schoolCount).toBe(
    broad.total,
  );
  const revoke = roleInput(await f.detail(roleId));
  revoke.grants = revoke.grants.map((g) => ({
    ...g,
    grant: { level: "none" },
  }));
  expect(
    (await f.request(`/roles/${roleId}/grants`, "PUT", revoke)).status,
  ).toBe(200);
  expect(
    (await f.request(`/scope/schools${query}`, "GET", undefined, actor.token))
      .status,
  ).toBe(403);
  expect(await visible(actor.identityId, query)).toMatchObject({
    schoolCount: 0,
    total: 0,
    warnings: ["permission_not_granted"],
  });
});

it("草稿预览计算期间学校停用，返回前重算而不是返回旧数量", async () => {
  const school = await f.school("990200");
  const before = await preview({
    mode: "selection",
    scopes: [{ type: "region", value: "990200" }],
  });
  const service = f.app.get(ScopeService),
    original = service.countSelection.bind(service);
  let reached!: () => void, release!: () => void;
  const ready = new Promise<void>((r) => {
      reached = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  const spy = vi
    .spyOn(service, "countSelection")
    .mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      reached();
      await gate;
      return result;
    });
  try {
    const request = f.request("/scope/preview", "POST", {
      mode: "selection",
      scopes: [{ type: "region", value: "990200" }],
    });
    await ready;
    await f.pool.query("UPDATE public.orgs SET status=0 WHERE id=$1", [school]);
    release();
    const response = await request;
    expect(response.status).toBe(200);
    const result = successResponseSchema(scopePreviewSchema).parse(
      await response.json(),
    ).data;
    expect(result.schoolCount).toBe(before.schoolCount - 1);
    expect(result.schoolCount).toBe(
      await original(f.admin.orgId, [{ type: "region", value: "990200" }]),
    );
  } finally {
    release();
    spy.mockRestore();
  }
});

it("失效成员不能返回计算过程，重复规范化学校标识返回字段校验错误", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  await f.pool.query("UPDATE public.identities SET status=0 WHERE id=$1", [
    actor.identityId,
  ]);
  expect(
    (await f.request(`/identities/${actor.identityId}/visible`)).status,
  ).toBe(404);
  const school = await f.school();
  expect(
    (
      await f.request("/scope/preview", "POST", {
        mode: "selection",
        scopes: [
          { type: "school", value: school },
          { type: "school", value: school.toUpperCase() },
        ],
      })
    ).status,
  ).toBe(400);
});

it("学校选择候选使用菜单功能权限：只有教学班查看也可选校，不借用学校列表权限", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  const roleId = await f.role(actor.identityId, f.admin.orgId, "all");
  await f.pool.query(
    "UPDATE public.role_grants SET level=CASE WHEN app_code='school' AND feature_code='teaching-class' THEN 'view' ELSE 'none' END WHERE role_id=$1",
    [roleId],
  );
  const schoolId = await f.school();
  expect(
    (await f.request("/scope/schools", "GET", undefined, actor.token)).status,
  ).toBe(403);
  expect(
    (
      await f.request(
        "/scope/schools?permission=school:class:view",
        "GET",
        undefined,
        actor.token,
      )
    ).status,
  ).toBe(403);
  const candidates = await list(
    actor.token,
    "?permission=school:teaching-class:view",
  );
  expect(candidates.items.some((item) => item.id === schoolId)).toBe(true);
  expect(
    candidates.items.find((item) => item.id === schoolId)?.allowedActions,
  ).toEqual(["view"]);
  expect(
    (
      await f.request(
        "/scope/schools?permission=school:teaching-class:update",
        "GET",
        undefined,
        actor.token,
      )
    ).status,
  ).toBe(403);
});

import {
  apiResponseSchema,
  departmentScopesSchema,
  departmentTreeSchema,
  scopeOptionsSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { Redis } from "ioredis";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { DepartmentsRepository } from "../../src/modules/platform/departments/index.js";
import { ScopeService } from "../../src/modules/platform/scope/index.js";
import { scopeFixture } from "../helpers/scope.js";

let f: Awaited<ReturnType<typeof scopeFixture>>;
let redis: Redis;
beforeAll(async () => {
  f = await scopeFixture();
  redis = new Redis(f.config.REDIS_URL);
  await f.pool.query(`
    INSERT INTO public.regions(code,name,level,parent_code,path) VALUES
    ('970000','范围验收省',1,NULL,'970000'),
    ('970100','范围验收市',2,'970000','970000.970100'),
    ('970101','范围验收区',3,'970100','970000.970100.970101'),
    ('960000','停用验收省',1,NULL,'960000')`);
  await f.pool.query("UPDATE public.regions SET status=0 WHERE code='960000'");
}, 120000);
afterAll(async () => {
  redis?.disconnect();
  await f?.stop();
}, 30000);

async function departmentData(r: Response) {
  expect(r.status).toBe(200);
  return successResponseSchema(departmentScopesSchema).parse(await r.json())
    .data;
}
async function options(query: string, token = f.admin.token) {
  const r = await f.request(`/scope-options?${query}`, "GET", undefined, token);
  expect(r.status).toBe(200);
  return successResponseSchema(scopeOptionsSchema).parse(await r.json()).data;
}
async function denied(r: Response, status: number, code: number) {
  expect(r.status).toBe(status);
  expect(apiResponseSchema.parse(await r.json()).code).toBe(code);
}
const set = (
  id: string,
  version: number,
  scopes: unknown[],
  token = f.admin.token,
  query = "",
  key = v7(),
) =>
  f.request(
    `/departments/${id}/scopes${query}`,
    "PUT",
    { version, scopes },
    token,
    key,
  );
const get = (id: string, token = f.admin.token, query = "") =>
  f.request(`/departments/${id}/scopes${query}`, "GET", undefined, token);
async function state(id: string) {
  const row = await f.pool.query(
    "SELECT version FROM public.departments WHERE id=$1",
    [id],
  );
  const values = await f.pool.query(
    "SELECT scope_type,scope_value FROM public.department_scopes WHERE department_id=$1 ORDER BY scope_type,scope_value",
    [id],
  );
  const audit = await f.pool.query(
    "SELECT changes FROM public.audit_logs WHERE target_id=$1 AND action='department.scopes.update' ORDER BY created_at",
    [id],
  );
  return {
    version: row.rows[0].version,
    scopes: values.rows,
    audits: audit.rows,
  };
}

it("区划候选按级加载，关键字搜索与分页有稳定总数，禁用区划不返回", async () => {
  const roots = await options("type=region");
  expect(roots.allowedTypes).toEqual(["school", "region"]);
  expect(roots.items.map((r) => r.value)).toContain("970000");
  expect(roots.items.map((r) => r.value)).not.toContain("960000");
  expect(roots.items.every((r) => r.parentValue === null)).toBe(true);
  expect(
    (await options("type=region&parent=970000")).items.map((r) => r.value),
  ).toEqual(["970100"]);
  expect(
    (await options("type=region&parent=970100")).items.map((r) => r.value),
  ).toEqual(["970101"]);
  expect(
    await options("type=region&keyword=范围验收&page=2&pageSize=1"),
  ).toMatchObject({
    total: 3,
    page: 2,
    pageSize: 1,
    items: [
      { type: "region", value: "970100", name: "范围验收市", available: true },
    ],
  });
  const beyond = await options(
    "type=region&keyword=范围验收&page=9&pageSize=1",
  );
  expect(beyond).toMatchObject({ total: 3, items: [] });
  for (const parent of ["950000", "960000"])
    await denied(
      await f.request(`/scope-options?type=region&parent=${parent}`),
      404,
      90004,
    );
});

it("学校候选只返回真实启用学校，搜索分页不会返回停用、软删或其他组织", async () => {
  const ids = await Promise.all(Array.from({ length: 5 }, () => f.school()));
  for (const [index, id] of ids.entries())
    await f.pool.query("UPDATE public.orgs SET name=$2 WHERE id=$1", [
      id,
      `候选验收学校${index}`,
    ]);
  await f.pool.query("UPDATE public.orgs SET status=0 WHERE id=$1", [ids[3]]);
  await f.pool.query("UPDATE public.orgs SET deleted_at=now() WHERE id=$1", [
    ids[4],
  ]);
  const result = await options(
    "type=school&keyword=候选验收学校&page=2&pageSize=2",
  );
  expect(result).toMatchObject({ total: 3, page: 2, pageSize: 2 });
  expect(result.items.map((s) => s.value)).toEqual([ids[2]]);
  expect(result.items[0]?.name).toBe("候选验收学校2");
  const literal = await f.school();
  await f.pool.query(
    "UPDATE public.orgs SET name='候选验收%_学校' WHERE id=$1",
    [literal],
  );
  expect(
    (await options("type=school&keyword=%25_")).items.map((s) => s.value),
  ).toEqual([literal]);
});

it("整体替换去重计算学校数、返回名称，幂等重放仅写一次版本与审计", async () => {
  const dept = await f.department();
  const school = await f.school("970101");
  const input = [
    { type: "region", value: "970000" },
    { type: "school", value: school },
  ];
  const key = v7();
  const saved = await departmentData(
    await set(dept.id, 0, input, undefined, "", key),
  );
  expect(saved).toMatchObject({
    departmentId: dept.id,
    version: 1,
    schoolCount: 1,
    allowedActions: ["update"],
  });
  expect(saved.scopes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "school",
        value: school,
        name: "范围测试学校",
        available: true,
      }),
      expect.objectContaining({
        type: "region",
        value: "970000",
        name: "范围验收省",
        available: true,
      }),
    ]),
  );
  const snapshot = await state(dept.id);
  expect(snapshot.audits).toHaveLength(1);
  await denied(await set(dept.id, 0, input, undefined, "", key), 409, 90003);
  expect(await state(dept.id)).toEqual(snapshot);
  expect(await departmentData(await get(dept.id))).toEqual(saved);
  const tree = await f.request("/departments/tree");
  const data = successResponseSchema(departmentTreeSchema).parse(
    await tree.json(),
  ).data;
  expect(data.items.find((d) => d.id === dept.id)?.scopeSummary).toEqual([
    { type: "region", count: 1 },
    { type: "school", count: 1 },
  ]);
  const newSchool = await f.school("970101");
  expect((await departmentData(await get(dept.id))).schoolCount).toBe(2);
  expect(saved.scopes.some((s) => s.value === newSchool)).toBe(false);
  expect(await departmentData(await set(dept.id, 1, []))).toMatchObject({
    version: 2,
    scopes: [],
    schoolCount: 0,
  });
});

it("教育局候选、读写和超管代办始终受目标辖区限制", async () => {
  const bureau = await f.seed("bureau", "bureau-admin");
  await f.pool.query(
    "UPDATE public.orgs SET region_code='990100' WHERE id=$1",
    [bureau.orgId],
  );
  const dept = await f.department(bureau.orgId);
  const own = await f.school("990100");
  const child = await f.school("990101");
  const outside = await f.school("990200");
  expect(
    (await options("type=region", bureau.token)).items.map((r) => r.value),
  ).toEqual(["990100"]);
  expect(
    (await options("type=region&parent=990100", bureau.token)).items.map(
      (r) => r.value,
    ),
  ).toEqual(["990101"]);
  for (const parent of ["990000", "990200", "980000"])
    await denied(
      await f.request(
        `/scope-options?type=region&parent=${parent}`,
        "GET",
        undefined,
        bureau.token,
      ),
      404,
      90004,
    );
  const candidates = await options("type=school", bureau.token);
  expect(candidates.items.map((s) => s.value)).toEqual(
    expect.arrayContaining([own, child]),
  );
  expect(candidates.items.some((s) => s.value === outside)).toBe(false);
  await departmentData(
    await set(
      dept.id,
      0,
      [
        { type: "school", value: own },
        { type: "school", value: child },
      ],
      bureau.token,
    ),
  );
  const snapshot = await state(dept.id);
  for (const scope of [
    { type: "region", value: "990000" },
    { type: "region", value: "990200" },
    { type: "school", value: outside },
  ]) {
    await denied(await set(dept.id, 1, [scope], bureau.token), 404, 90004);
    await denied(
      await set(dept.id, 1, [scope], undefined, `?orgId=${bureau.orgId}`),
      404,
      90004,
    );
    expect(await state(dept.id)).toEqual(snapshot);
  }
  const delegated = await options(`type=school&orgId=${bureau.orgId}`);
  expect(delegated.items.some((s) => s.value === outside)).toBe(false);
  expect(
    await departmentData(
      await get(dept.id, undefined, `?orgId=${bureau.orgId}`),
    ),
  ).toMatchObject({ version: 1, schoolCount: 2 });
});

it("跨组织部门隐藏为404，缺少动作权限为403，账号级令牌不能读取", async () => {
  const other = await f.seed("company", "company-super-admin");
  const dept = await f.department(other.orgId);
  await denied(await get(dept.id), 404, 90004);
  await denied(await set(dept.id, 0, []), 404, 90004);
  const readonly = await f.seed(
    "company",
    "company-readonly-auditor",
    other.orgId,
  );
  const view = await departmentData(await get(dept.id, readonly.token));
  expect(view.allowedActions).toEqual([]);
  await denied(await set(dept.id, 0, [], readonly.token), 403, 11101);
  await denied(
    await f.request(
      "/scope-options?type=school",
      "GET",
      undefined,
      readonly.token,
    ),
    403,
    11101,
  );
  await denied(
    await get(dept.id, readonly.token, `?orgId=${other.orgId}`),
    403,
    11101,
  );
  await denied(
    await f.request(
      `/scope-options?type=school&orgId=${other.orgId}`,
      "GET",
      undefined,
      readonly.token,
    ),
    403,
    11101,
  );
  await denied(await get(dept.id, other.account), 401, 10005);
  const noRole = await f.seed("company", null, other.orgId);
  await denied(await get(dept.id, noRole.token), 403, 11101);
  expect(await state(dept.id)).toEqual({ version: 0, scopes: [], audits: [] });
});

it("部门管理遵循本组织边界，不要求操作人具有学校业务查看或角色查看权限", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  const role = await f.role(actor.identityId, actor.orgId, "personal", "none");
  await f.pool.query(
    "UPDATE public.role_grants SET level='edit' WHERE role_id=$1 AND app_code='org' AND feature_code='department'",
    [role],
  );
  const dept = await f.department();
  const school = await f.school();
  expect(
    (await f.request("/roles", "GET", undefined, actor.token)).status,
  ).toBe(403);
  expect(
    (await options("type=school", actor.token)).items.length,
  ).toBeGreaterThan(0);
  expect(
    await departmentData(
      await set(dept.id, 0, [{ type: "school", value: school }], actor.token),
    ),
  ).toMatchObject({ schoolCount: 1, version: 1 });
});

it("停用或越界的已保存范围保留值但隐藏名称，不计学校数，不允许重新提交", async () => {
  const bureau = await f.seed("bureau", "bureau-admin");
  const dept = await f.department(bureau.orgId);
  const school = await f.school("990101");
  await departmentData(
    await set(dept.id, 0, [{ type: "school", value: school }], bureau.token),
  );
  await f.pool.query("UPDATE public.orgs SET status=0 WHERE id=$1", [school]);
  const disabled = await departmentData(await get(dept.id, bureau.token));
  expect(disabled).toMatchObject({
    version: 1,
    schoolCount: 0,
    scopes: [
      {
        type: "school",
        value: school,
        available: false,
        name: "已失效的负责范围",
      },
    ],
  });
  await denied(
    await set(dept.id, 1, [{ type: "school", value: school }], bureau.token),
    404,
    90004,
  );
  await f.pool.query("UPDATE public.orgs SET status=1 WHERE id=$1", [school]);
  expect(
    (await departmentData(await get(dept.id, bureau.token))).schoolCount,
  ).toBe(1);
  await f.pool.query(
    "UPDATE public.orgs SET region_code='990200' WHERE id=$1",
    [bureau.orgId],
  );
  expect(await departmentData(await get(dept.id, bureau.token))).toMatchObject({
    schoolCount: 0,
    scopes: [{ value: school, name: "已失效的负责范围", available: false }],
  });
  expect((await state(dept.id)).scopes).toHaveLength(1);
});

it("无效学校、已删对象和停用区划整体拒绝，不能通过混入合法项部分写入", async () => {
  const dept = await f.department();
  const school = await f.school();
  const deleted = await f.school();
  await f.pool.query("UPDATE public.orgs SET deleted_at=now() WHERE id=$1", [
    deleted,
  ]);
  for (const scope of [
    { type: "school", value: v7() },
    { type: "school", value: f.admin.orgId },
    { type: "school", value: deleted },
    { type: "region", value: "960000" },
    { type: "region", value: "950000" },
  ]) {
    await denied(
      await set(dept.id, 0, [{ type: "school", value: school }, scope]),
      404,
      90004,
    );
    expect(await state(dept.id)).toEqual({
      version: 0,
      scopes: [],
      audits: [],
    });
  }
});

it("未开放组织和类型拒绝非空范围，但仍能安全清空原配置", async () => {
  for (const [type, role] of [
    ["school", "school-admin"],
    ["agent", "agent-admin"],
  ] as const) {
    const actor = await f.seed(type, role);
    const dept = await f.department(actor.orgId);
    expect(await departmentData(await get(dept.id, actor.token))).toMatchObject(
      { allowedTypes: [], scopes: [], schoolCount: 0 },
    );
    await denied(
      await set(
        dept.id,
        0,
        [{ type: "school", value: actor.orgId }],
        actor.token,
      ),
      422,
      12004,
    );
    await denied(
      await f.request(
        "/scope-options?type=school",
        "GET",
        undefined,
        actor.token,
      ),
      422,
      12004,
    );
    expect(
      await departmentData(await set(dept.id, 0, [], actor.token)),
    ).toMatchObject({ version: 1, scopes: [] });
  }
  const dept = await f.department();
  for (const scope of [
    { type: "grade", value: "11" },
    { type: "college", value: v7() },
  ])
    await denied(await set(dept.id, 0, [scope]), 422, 12004);
});

it("范围和改名共用版本，同版本并发仅一次成功，失败不写审计", async () => {
  const dept = await f.department();
  const responses = await Promise.all(
    ["990100", "990200"].map((value) =>
      set(dept.id, 0, [{ type: "region", value }]),
    ),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const snapshot = await state(dept.id);
  expect(snapshot.version).toBe(1);
  expect(snapshot.audits).toHaveLength(1);
  await denied(
    await f.request(`/departments/${dept.id}`, "PATCH", {
      version: 0,
      name: "过期改名",
    }),
    409,
    90002,
  );
  expect(
    (
      await f.request(`/departments/${dept.id}`, "PATCH", {
        version: 1,
        name: "版本验收部门",
      })
    ).status,
  ).toBe(200);
  await denied(await set(dept.id, 1, []), 409, 90002);
  expect((await state(dept.id)).scopes).toEqual(snapshot.scopes);
});

it("写入排队期间撤权后重读权限并拒绝，版本、范围、审计不变", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  const role = await f.role(actor.identityId, actor.orgId, "personal", "none");
  await f.pool.query(
    "UPDATE public.role_grants SET level='edit' WHERE role_id=$1 AND app_code='org' AND feature_code='department'",
    [role],
  );
  const dept = await f.department();
  const client = await f.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1936749167,41)");
    const pending = set(
      dept.id,
      0,
      [{ type: "region", value: "990100" }],
      actor.token,
    );
    await vi.waitFor(async () => {
      const q = await f.pool.query(
        "SELECT count(*)::int AS total FROM pg_stat_activity WHERE wait_event='advisory'",
      );
      expect(q.rows[0].total).toBeGreaterThan(0);
    });
    await client.query(
      "DELETE FROM public.identity_roles WHERE identity_id=$1",
      [actor.identityId],
    );
    await client.query("COMMIT");
    await denied(await pending, 403, 11101);
    expect(await state(dept.id)).toEqual({
      version: 0,
      scopes: [],
      audits: [],
    });
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

it("当前部门合计不含子部门和本人额外，保存后真实成员可见缓存立即变化", async () => {
  const parent = await f.department();
  const child = await f.department(undefined, parent);
  const [a, b, c] = await Promise.all([f.school(), f.school(), f.school()]);
  const actor = await f.seed("company", null, f.admin.orgId);
  await f.assign(actor.identityId, parent.id);
  await f.role(actor.identityId, actor.orgId, "dept_and_below");
  await f.personal(actor.identityId, "school", c);
  const scopes = f.app.get(ScopeService);
  expect(await scopes.resolve(actor.identityId, "school:student:view")).toEqual(
    { kind: "schools", schoolIds: [c] },
  );
  await departmentData(await set(child.id, 0, [{ type: "school", value: b }]));
  const saved = await departmentData(
    await set(parent.id, 0, [{ type: "school", value: a }]),
  );
  expect(saved.schoolCount).toBe(1);
  expect(await scopes.resolve(actor.identityId, "school:student:view")).toEqual(
    { kind: "schools", schoolIds: [a, b, c].sort() },
  );
  await departmentData(await set(parent.id, 1, []));
  expect(await scopes.resolve(actor.identityId, "school:student:view")).toEqual(
    { kind: "schools", schoolIds: [b, c].sort() },
  );
  expect(await redis.exists(`scope:${actor.identityId}:dept_and_below`)).toBe(
    1,
  );
});

it("审计失败整体回滚配置和部门版本", async () => {
  const dept = await f.department();
  const spy = vi
    .spyOn(f.app.get(DepartmentsRepository), "audit")
    .mockRejectedValueOnce(new Error("test audit unavailable"));
  try {
    expect(
      (await set(dept.id, 0, [{ type: "region", value: "990100" }])).status,
    ).toBe(500);
    expect(await state(dept.id)).toEqual({
      version: 0,
      scopes: [],
      audits: [],
    });
  } finally {
    spy.mockRestore();
  }
});

it("UUID统一小写并校验逻辑重复，格式错误和缺幂等头不触发写入", async () => {
  const dept = await f.department();
  const school = await f.school();
  expect(
    await departmentData(
      await set(dept.id.toUpperCase(), 0, [
        { type: "school", value: school.toUpperCase() },
      ]),
    ),
  ).toMatchObject({ scopes: [{ value: school }], version: 1 });
  await denied(
    await set(dept.id, 1, [
      { type: "school", value: school },
      { type: "school", value: school.toUpperCase() },
    ]),
    400,
    90001,
  );
  const snapshot = await state(dept.id);
  for (const input of [
    { scopes: [] },
    { version: -1, scopes: [] },
    { version: 1, scopes: [], orgId: f.admin.orgId },
  ])
    await denied(
      await f.request(`/departments/${dept.id}/scopes`, "PUT", input),
      400,
      90001,
    );
  await denied(
    await fetch(`${f.base}/api/v1/departments/${dept.id}/scopes`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${f.admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ version: 1, scopes: [] }),
    }),
    400,
    90001,
  );
  for (const query of [
    "type=class",
    "type=region&parent=9",
    "type=school&parent=990000",
    "type=school&pageSize=999",
    "type=school&permissions=view",
  ])
    await denied(await f.request(`/scope-options?${query}`), 400, 90001);
  expect(await state(dept.id)).toEqual(snapshot);
});

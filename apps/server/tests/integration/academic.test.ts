import {
  type AcademicYear,
  academicYearListSchema,
  academicYearSchema,
  currentAcademicSchema,
  semesterSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { v7 } from "uuid";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { migratePublic } from "../../src/database/migrate.js";
import { AcademicRepository } from "../../src/modules/platform/academic/index.js";
import {
  roleInput,
  roleManagementFixture,
} from "../helpers/role-management.js";

let f: Awaited<ReturnType<typeof roleManagementFixture>>;
beforeAll(async () => {
  f = await roleManagementFixture();
}, 120000);
afterAll(async () => {
  await f?.stop();
}, 30000);
beforeEach(async () => {
  await f.pool.query(
    "DELETE FROM public.audit_logs WHERE action LIKE 'academic.%'",
  );
  await f.pool.query("DELETE FROM public.semesters");
  await f.pool.query("DELETE FROM public.academic_years");
});
async function create(startYear = 2026) {
  const r = await f.request("/academic-years", "POST", { startYear });
  expect(r.status).toBe(201);
  return successResponseSchema(academicYearSchema).parse(await r.json()).data;
}
async function list(token = f.admin.token) {
  const r = await f.request("/academic-years", "GET", undefined, token);
  expect(r.status).toBe(200);
  return successResponseSchema(academicYearListSchema).parse(await r.json())
    .data;
}
async function current() {
  const r = await f.request("/academic-years/current");
  expect(r.status).toBe(200);
  return successResponseSchema(currentAcademicSchema).parse(await r.json())
    .data;
}
const setPath = (year: AcademicYear, term = 0) =>
  `/semesters/${year.semesters[term]?.id}/set-current`;
const audits = async () =>
  (
    await f.pool.query(
      "SELECT * FROM public.audit_logs WHERE action LIKE 'academic.%' ORDER BY created_at",
    )
  ).rows;
const calendar = async () => ({
  years: (await f.pool.query("SELECT * FROM public.academic_years ORDER BY id"))
    .rows,
  terms: (await f.pool.query("SELECT * FROM public.semesters ORDER BY id"))
    .rows,
});
async function customActor(actions: string[]) {
  const actor = await f.seed("company", null, f.admin.orgId),
    id = v7();
  await f.pool.query(
    `INSERT INTO public.roles(id,kind,identity_type,org_id,code,name,data_scope,base_role_id)
     SELECT $1,'custom','company',$2,$1::uuid::text,'学年测试角色','all',id
     FROM public.roles WHERE code='company-super-admin'`,
    [id, actor.orgId],
  );
  await f.pool.query(
    `INSERT INTO public.role_grants(role_id,app_code,feature_code,level,actions)
     SELECT $1,app_code,code,CASE WHEN app_code='system' AND code='academic' THEN 'custom' ELSE 'none' END,
     CASE WHEN app_code='system' AND code='academic' THEN $2::text[] ELSE NULL END FROM public.features`,
    [id, actions],
  );
  await f.pool.query("INSERT INTO public.identity_roles VALUES($1,$2)", [
    actor.identityId,
    id,
  ]);
  return { ...actor, roleId: id };
}
it("迁移可重跑，空库读不创建日历；登录全局可读，账号级和无令牌不可读", async () => {
  expect(await migratePublic(f.pool)).toEqual([]);
  expect(await list()).toEqual([]);
  expect(await current()).toEqual({ academicYear: null, semester: null });
  const school = await f.seed("school", null);
  expect(await list(school.token)).toEqual([]);
  for (const path of ["/academic-years", "/academic-years/current"]) {
    expect(
      (await f.request(path, "GET", undefined, f.admin.account)).status,
    ).toBe(401);
    expect((await fetch(`${f.base}/api/v1${path}`)).status).toBe(401);
  }
});
it("新建自动生成两个非当前学期，上海日期存储、公共字段、审计与倒序列表正确", async () => {
  const a = await create(),
    b = await create(2027);
  expect(a).toMatchObject({
    name: "2026-2027学年",
    status: "draft",
    version: 0,
    isCurrent: false,
  });
  expect(
    a.semesters.map((s) => [s.term, s.startDate, s.endDate, s.isCurrent]),
  ).toEqual([
    [1, "2026-09-01", "2027-01-31", false],
    [2, "2027-02-01", "2027-07-31", false],
  ]);
  expect((await list()).map((s) => s.id)).toEqual([b.id, a.id]);
  expect(await current()).toEqual({ academicYear: null, semester: null });
  const rows = await calendar();
  expect(rows.years[0].created_by).toBe(f.admin.identityId);
  expect(rows.years[0].start_date.toISOString()).toBe(
    "2026-08-31T16:00:00.000Z",
  );
  expect(await audits()).toHaveLength(2);
  expect((await audits())[0]).toMatchObject({
    action: "academic.year.create",
    org_id: f.admin.orgId,
  });
});
it("首次设当前、同学年切换、跨学年关闭旧年，历史记录无操作且拒绝重开", async () => {
  const a = await create(),
    b = await create(2027);
  expect((await f.request(setPath(a), "POST", { version: 0 })).status).toBe(
    200,
  );
  const first = await current();
  expect(first.academicYear).toMatchObject({
    id: a.id,
    status: "current",
    version: 1,
  });
  expect(first.semester).toMatchObject({ id: a.semesters[0].id, version: 1 });
  expect((await f.request(setPath(a, 1), "POST", { version: 0 })).status).toBe(
    200,
  );
  expect((await current()).academicYear?.version).toBe(1);
  expect((await f.request(setPath(b), "POST", { version: 0 })).status).toBe(
    200,
  );
  const old = (await list()).find((y) => y.id === a.id);
  if (!old) throw new Error("未找到历史学年");
  expect(old).toMatchObject({ status: "closed", isCurrent: false, version: 2 });
  expect(
    old.semesters.every((s) => !s.isCurrent && s.allowedActions.length === 0),
  ).toBe(true);
  for (const s of old.semesters) {
    for (const [path, method, body] of [
      [
        `/semesters/${s.id}`,
        "PATCH",
        { version: s.version, startDate: s.startDate, endDate: s.endDate },
      ],
      [`/semesters/${s.id}/set-current`, "POST", { version: s.version }],
    ] as const) {
      const r = await f.request(path, method, body);
      expect(r.status).toBe(409);
      expect(await r.json()).toMatchObject({ code: 20002 });
    }
  }
  expect((await current()).semester?.id).toBe(b.semesters[0].id);
});
it("调整日期支持寒假，拒绝跨年、重叠和逆序，失败不写版本或审计", async () => {
  const a = await create(),
    s = a.semesters[0],
    path = `/semesters/${s.id}`;
  const r = await f.request(path, "PATCH", {
    version: 0,
    startDate: s.startDate,
    endDate: "2027-01-20",
  });
  expect(r.status).toBe(200);
  expect(
    successResponseSchema(semesterSchema).parse(await r.json()).data,
  ).toMatchObject({ version: 1, endDate: "2027-01-20" });
  const before = await calendar(),
    logs = await audits();
  for (const patch of [
    { startDate: "2026-08-31" },
    { endDate: "2027-09-01" },
    { endDate: "2027-02-01" },
    { startDate: "2027-01-31", endDate: "2027-01-01" },
    { endDate: "2027-02-29" },
  ]) {
    const res = await f.request(path, "PATCH", {
      version: 1,
      startDate: s.startDate,
      endDate: "2027-01-20",
      ...patch,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: 90001,
      data: { fields: expect.any(Object) },
    });
  }
  expect(await calendar()).toEqual(before);
  expect(await audits()).toEqual(logs);
});
it("只读和学校身份可读取但无行操作，所有写接口403且数据库不变", async () => {
  const a = await create(),
    readonly = await customActor(["view"]),
    school = await f.seed("school", "school-admin");
  const before = await calendar(),
    logs = await audits();
  for (const token of [readonly.token, school.token]) {
    expect(
      (await list(token))[0]?.semesters.every(
        (s) => s.allowedActions.length === 0,
      ),
    ).toBe(true);
    for (const [path, method, body] of [
      ["/academic-years", "POST", { startYear: 2027 }],
      [
        `/semesters/${a.semesters[0].id}`,
        "PATCH",
        { version: 0, startDate: "2026-09-01", endDate: "2027-01-20" },
      ],
      [setPath(a), "POST", { version: 0 }],
    ] as const)
      expect((await f.request(path, method, body, token)).status).toBe(403);
  }
  expect(await calendar()).toEqual(before);
  expect(await audits()).toEqual(logs);
});
it("同一真实角色从无权限改为编辑再退为只读，同一令牌的接口写权限立即变化", async () => {
  const actor = await customActor([]),
    a = await create();
  const patch = { version: 0, startDate: "2026-09-01", endDate: "2027-01-20" };
  const path = `/semesters/${a.semesters[0].id}`;
  expect((await f.request(path, "PATCH", patch, actor.token)).status).toBe(403);
  const input = roleInput(await f.detail(actor.roleId));
  input.grants = input.grants.map((g) =>
    g.app === "system" && g.feature === "academic"
      ? { ...g, grant: { level: "custom", actions: ["view", "update"] } }
      : g,
  );
  expect(
    (await f.request(`/roles/${actor.roleId}/grants`, "PUT", input)).status,
  ).toBe(200);
  expect((await f.request(path, "PATCH", patch, actor.token)).status).toBe(200);
  const readonly = roleInput(await f.detail(actor.roleId));
  readonly.grants = readonly.grants.map((g) =>
    g.app === "system" && g.feature === "academic"
      ? { ...g, grant: { level: "view" } }
      : g,
  );
  expect(
    (await f.request(`/roles/${actor.roleId}/grants`, "PUT", readonly)).status,
  ).toBe(200);
  expect(
    (await f.request(path, "PATCH", { ...patch, version: 1 }, actor.token))
      .status,
  ).toBe(403);
  expect(
    (await calendar()).terms.find((s) => s.id === a.semesters[0].id).version,
  ).toBe(1);
});
it("同年重复新建和并发新建只产生一份，软删除唯一性允许重建", async () => {
  const rs = await Promise.all([
    f.request("/academic-years", "POST", { startYear: 2026 }),
    f.request("/academic-years", "POST", { startYear: 2026 }),
  ]);
  expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(await rs.find((r) => r.status === 409)?.json()).toMatchObject({
    code: 20001,
  });
  expect(await audits()).toHaveLength(1);
  await f.pool.query("UPDATE public.semesters SET deleted_at=now()");
  await f.pool.query("UPDATE public.academic_years SET deleted_at=now()");
  expect((await create()).version).toBe(0);
});
it("旧版本、同版本日期并发仅一次成功，未知或已删资源404", async () => {
  const a = await create(),
    s = a.semesters[0],
    path = `/semesters/${s.id}`;
  const rs = await Promise.all(
    ["2027-01-20", "2027-01-21"].map((endDate) =>
      f.request(path, "PATCH", { version: 0, startDate: s.startDate, endDate }),
    ),
  );
  expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(await rs.find((r) => r.status === 409)?.json()).toMatchObject({
    code: 90002,
  });
  expect((await f.request(setPath(a), "POST", { version: 0 })).status).toBe(
    409,
  );
  expect(await audits()).toHaveLength(2);
  expect(
    (await f.request(`/semesters/${v7()}/set-current`, "POST", { version: 0 }))
      .status,
  ).toBe(404);
  await f.pool.query(
    "UPDATE public.semesters SET deleted_at=now() WHERE id=$1",
    [s.id],
  );
  expect((await f.request(setPath(a), "POST", { version: 1 })).status).toBe(
    404,
  );
});
it("同目标并发仅一次成功；不同学年目标并发串行关闭，不出现双当前", async () => {
  const a = await create();
  const rs = await Promise.all([
    f.request(setPath(a), "POST", { version: 0 }),
    f.request(setPath(a), "POST", { version: 0 }),
  ]);
  expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
  const b = await create(2027),
    c = await create(2028);
  const others = await Promise.all([
    f.request(setPath(b), "POST", { version: 0 }),
    f.request(setPath(c), "POST", { version: 0 }),
  ]);
  expect(others.map((r) => r.status)).toEqual([200, 200]);
  const rows = await calendar();
  expect(rows.years.filter((y) => y.is_current)).toHaveLength(1);
  expect(rows.terms.filter((s) => s.is_current)).toHaveLength(1);
  expect(rows.years.filter((y) => y.status === "closed")).toHaveLength(2);
  const now = await current();
  expect(now.semester?.academicYearId).toBe(now.academicYear?.id);
});
it("设置幂等重放和重复设置不多写审计，新建同键也只创建一次", async () => {
  const key = v7();
  expect(
    (
      await f.request(
        "/academic-years",
        "POST",
        { startYear: 2026 },
        f.admin.token,
        key,
      )
    ).status,
  ).toBe(201);
  const duplicate = await f.request(
    "/academic-years",
    "POST",
    { startYear: 2026 },
    f.admin.token,
    key,
  );
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({ code: 90003 });
  const a = (await list())[0],
    setKey = v7();
  if (!a) throw new Error("未找到新建学年");
  expect(
    (await f.request(setPath(a), "POST", { version: 0 }, f.admin.token, setKey))
      .status,
  ).toBe(200);
  const replay = await f.request(
    setPath(a),
    "POST",
    { version: 0 },
    f.admin.token,
    setKey,
  );
  expect(replay.status).toBe(409);
  expect(await replay.json()).toMatchObject({ code: 90003 });
  expect((await f.request(setPath(a), "POST", { version: 1 })).status).toBe(
    200,
  );
  expect(await audits()).toHaveLength(2);
});
it("切换后续写入失败整体回滚，原当前、目标版本和审计保持不变", async () => {
  const a = await create(),
    b = await create(2027);
  await f.request(setPath(a), "POST", { version: 0 });
  const before = await calendar(),
    logs = await audits();
  const spy = vi
    .spyOn(f.app.get(AcademicRepository), "audit")
    .mockRejectedValueOnce(new Error("模拟审计存储失败"));
  try {
    expect((await f.request(setPath(b), "POST", { version: 0 })).status).toBe(
      500,
    );
  } finally {
    spy.mockRestore();
  }
  expect(await calendar()).toEqual(before);
  expect(await audits()).toEqual(logs);
});
it("排队期间撤回真实角色修改权限，事务内重新加载并拒绝写入", async () => {
  const actor = await customActor(["view", "update"]),
    a = await create();
  const repository = f.app.get(AcademicRepository),
    original = repository.lockPolicy.bind(repository);
  let reached!: () => void, release!: () => void;
  const ready = new Promise<void>((r) => {
    reached = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const spy = vi
    .spyOn(repository, "lockPolicy")
    .mockImplementation(async (tx) => {
      reached();
      await gate;
      return original(tx);
    });
  try {
    const request = f.request(setPath(a), "POST", { version: 0 }, actor.token);
    await ready;
    await f.pool.query(
      "UPDATE public.role_grants SET actions=ARRAY['view'] WHERE role_id=$1 AND app_code='system' AND feature_code='academic'",
      [actor.roleId],
    );
    release();
    expect((await request).status).toBe(403);
    expect((await current()).semester).toBeNull();
    expect(await audits()).toHaveLength(1);
  } finally {
    release();
    spy.mockRestore();
  }
});
it("数据库部分唯一索引和约束独立拒绝双当前、重复学期和非法状态", async () => {
  const a = await create(),
    b = await create(2027);
  await f.request(setPath(a), "POST", { version: 0 });
  await expect(
    f.pool.query(
      "UPDATE public.academic_years SET is_current=true,status='current' WHERE id=$1",
      [b.id],
    ),
  ).rejects.toMatchObject({ code: "23505" });
  await expect(
    f.pool.query("UPDATE public.semesters SET is_current=true WHERE id=$1", [
      b.semesters[0].id,
    ]),
  ).rejects.toMatchObject({ code: "23505" });
  await expect(
    f.pool.query(
      "UPDATE public.academic_years SET status='closed' WHERE id=$1",
      [a.id],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    f.pool.query("UPDATE public.semesters SET term=1 WHERE id=$1", [
      a.semesters[1].id,
    ]),
  ).rejects.toMatchObject({ code: "23505" });
});

it("两个学期同时修改仍重新校验彼此边界，只有不重叠的一次成功", async () => {
  const a = await create();
  expect(
    (
      await f.request(`/semesters/${a.semesters[1].id}`, "PATCH", {
        version: 0,
        startDate: "2027-02-20",
        endDate: "2027-07-31",
      })
    ).status,
  ).toBe(200);
  const responses = await Promise.all([
    f.request(`/semesters/${a.semesters[0].id}`, "PATCH", {
      version: 0,
      startDate: "2026-09-01",
      endDate: "2027-02-10",
    }),
    f.request(`/semesters/${a.semesters[1].id}`, "PATCH", {
      version: 1,
      startDate: "2027-02-05",
      endDate: "2027-07-31",
    }),
  ]);
  // 两项与原日期都合法，但合并后重叠，后取得锁的请求必须被拒绝。
  expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
  const saved = (await list())[0];
  if (!saved) throw new Error("未找到学年");
  expect(saved.semesters[0].endDate < saved.semesters[1].startDate).toBe(true);
});

it("严格请求校验、缺少版本和幂等键均400，未知资源和软删学年404", async () => {
  const a = await create();
  for (const body of [
    { startYear: 2026, isCurrent: true },
    { startYear: "2027" },
    { startYear: 9999 },
  ])
    expect((await f.request("/academic-years", "POST", body)).status).toBe(400);
  expect((await f.request("/academic-years?schoolId=invalid")).status).toBe(
    400,
  );
  expect((await f.request(setPath(a), "POST", {})).status).toBe(400);
  expect(
    (
      await f.request(`/semesters/${a.semesters[0].id}`, "PATCH", {
        startDate: "2026-09-01",
        endDate: "2027-01-20",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await fetch(`${f.base}/api/v1/academic-years`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${f.admin.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ startYear: 2027 }),
      })
    ).status,
  ).toBe(400);
  expect(
    (await f.request("/semesters/invalid/set-current", "POST", { version: 0 }))
      .status,
  ).toBe(400);
  await f.pool.query(
    "UPDATE public.academic_years SET deleted_at=now() WHERE id=$1",
    [a.id],
  );
  expect((await f.request(setPath(a), "POST", { version: 0 })).status).toBe(
    404,
  );
  expect(await audits()).toHaveLength(1);
});

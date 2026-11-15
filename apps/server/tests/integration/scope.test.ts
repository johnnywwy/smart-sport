import { performance } from "node:perf_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import { Redis } from "ioredis";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  ContextRepository,
  IdentityContextService,
} from "../../src/modules/platform/identity-context/index.js";
import {
  RolesRepository,
  RolesService,
} from "../../src/modules/platform/roles/index.js";
import {
  ScopeRepository,
  ScopeService,
} from "../../src/modules/platform/scope/index.js";
import { roleInput } from "../helpers/role-management.js";
import { scopeFixture } from "../helpers/scope.js";

let f: Awaited<ReturnType<typeof scopeFixture>>;
let scopes: ScopeService;
let redis: Redis;
beforeAll(async () => {
  f = await scopeFixture();
  scopes = f.app.get(ScopeService);
  redis = new Redis(f.config.REDIS_URL);
}, 120000);
afterAll(async () => {
  redis?.disconnect();
  await f?.stop();
}, 30000);
const visible = (ids: string[]) => ({
  kind: "schools",
  schoolIds: [...new Set(ids)].sort(),
});
const resolve = (id: string) => scopes.resolve(id, "school:student:view");
const allowed = (id: string, schoolId: string) =>
  scopes.requireSchool(id, "school:student:view", schoolId);

it("公司全量仍拒绝不存在、非学校、停用、删除和无效学校标识", async () => {
  const active = await f.school();
  const disabled = await f.school();
  const deleted = await f.school();
  await f.pool.query("UPDATE public.orgs SET status=0 WHERE id=$1", [disabled]);
  await f.pool.query("UPDATE public.orgs SET deleted_at=now() WHERE id=$1", [
    deleted,
  ]);
  expect(await resolve(f.admin.identityId)).toEqual({ kind: "all-schools" });
  await allowed(f.admin.identityId, active.toUpperCase());
  for (const id of [disabled, deleted, f.admin.orgId, v7(), "", "invalid"])
    await expect(allowed(f.admin.identityId, id)).rejects.toMatchObject({
      code: 90004,
      status: 404,
    });
});

it("教育局全量仅包含辖区本级与后代，不能通过额外负责扩大外边界", async () => {
  const bureau = await f.seed("bureau", "bureau-admin");
  await f.pool.query(
    "UPDATE public.orgs SET region_code='990100' WHERE id=$1",
    [bureau.orgId],
  );
  const own = await f.school("990100");
  const child = await f.school();
  const outside = await f.school("990200");
  await f.personal(bureau.identityId, "school", outside);
  const result = await scopes.resolve(bureau.identityId, "ops:school:view");
  expect(result).toMatchObject({
    kind: "schools",
    schoolIds: expect.arrayContaining([own, child]),
  });
  await scopes.requireSchool(bureau.identityId, "ops:school:view", child);
  await expect(
    scopes.requireSchool(bureau.identityId, "ops:school:view", outside),
  ).rejects.toMatchObject({
    code: 90004,
  });
  // 污染的额外选择也必须经过最终辖区交集。
  const role = (
    await f.pool.query("SELECT id FROM public.roles WHERE code='bureau-admin'")
  ).rows[0].id;
  await f.pool.query(
    "INSERT INTO public.preset_role_overrides(role_id,data_scope,grants) VALUES($1,'personal','[]')",
    [role],
  );
  await f.personal(bureau.identityId, "region", "990000");
  const personal = await scopes.resolve(bureau.identityId, "ops:school:view");
  expect(personal).toEqual(result);
  await f.pool.query(
    "DELETE FROM public.preset_role_overrides WHERE role_id=$1",
    [role],
  );
});

it("部门、本部门及以下、本人分别展开，并且不读取其他组织或已删部门", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  const parent = await f.department();
  const child = await f.department(undefined, parent);
  const sibling = await f.department();
  const otherOrg = await f.seed("company", null);
  const foreign = await f.department(otherOrg.orgId);
  const deleted = await f.department(undefined, parent);
  const schools = await Promise.all(
    Array.from({ length: 5 }, () => f.school()),
  );
  const ownSchool = schools[0];
  const childSchool = schools[1];
  if (!ownSchool || !childSchool) throw new Error("缺少测试学校");
  await f.assign(actor.identityId, parent.id);
  const role = await f.role(actor.identityId, actor.orgId, "dept");
  for (const [i, dept] of [parent, child, sibling, foreign, deleted].entries())
    await f.responsibility(dept.id, "school", schools[i] as string);
  await f.pool.query(
    "UPDATE public.departments SET deleted_at=now() WHERE id=$1",
    [deleted.id],
  );
  const extra = await f.school("990200");
  await f.personal(actor.identityId, "school", extra);
  expect(await resolve(actor.identityId)).toEqual(visible([ownSchool, extra]));
  await f.pool.query(
    "UPDATE public.roles SET data_scope='dept_and_below' WHERE id=$1",
    [role],
  );
  expect(await resolve(actor.identityId)).toEqual(
    visible([ownSchool, childSchool, extra]),
  );
  await f.pool.query(
    "UPDATE public.roles SET data_scope='personal' WHERE id=$1",
    [role],
  );
  expect(await resolve(actor.identityId)).toEqual(visible([extra]));
  await f.pool.query("UPDATE public.roles SET data_scope='dept' WHERE id=$1", [
    role,
  ]);
  await f.assign(actor.identityId, null);
  expect(await resolve(actor.identityId)).toEqual(visible([]));
});

it("查看全量与修改本部门分别取自己的范围，额外负责不授予缺失动作", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  const dept = await f.department();
  const inside = await f.school();
  const outside = await f.school();
  await f.assign(actor.identityId, dept.id);
  await f.responsibility(dept.id, "school", inside);
  await f.role(actor.identityId, actor.orgId, "all", "view");
  await f.role(actor.identityId, actor.orgId, "dept", "edit");
  expect(await resolve(actor.identityId)).toEqual({ kind: "all-schools" });
  expect(
    await scopes.resolve(actor.identityId, "school:student:update"),
  ).toEqual(visible([inside]));
  await allowed(actor.identityId, outside);
  await expect(
    scopes.requireSchool(actor.identityId, "school:student:update", outside),
  ).rejects.toMatchObject({ code: 90004 });
  await f.personal(actor.identityId, "school", outside);
  await scopes.requireSchool(
    actor.identityId,
    "school:student:update",
    outside,
  );
  await expect(
    scopes.resolve(actor.identityId, "school:student:delete"),
  ).rejects.toMatchObject({ code: 11101, status: 403 });
});

it("真实范围写接口、成员移部门与部门移动提交后立即改变缓存结果", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  const parent = await f.department();
  const child = await f.department();
  const inside = await f.school();
  const extra = await f.school();
  await f.assign(actor.identityId, parent.id);
  await f.responsibility(child.id, "school", inside);
  await f.role(actor.identityId, actor.orgId, "dept_and_below");
  expect(await resolve(actor.identityId)).toEqual(visible([]));
  const move = await f.request(`/departments/${child.id}`, "PATCH", {
    version: 0,
    parentId: parent.id,
  });
  expect(move.status).toBe(200);
  expect(await resolve(actor.identityId)).toEqual(visible([inside]));
  const set = await f.request(`/identities/${actor.identityId}/scopes`, "PUT", {
    version: 0,
    scopes: [{ type: "school", value: extra }],
  });
  expect(set.status).toBe(200);
  expect(await resolve(actor.identityId)).toEqual(visible([inside, extra]));
  const member = await f.request(`/members/${actor.identityId}`, "PATCH", {
    version: 1,
    departmentId: child.id,
  });
  expect(member.status).toBe(200);
  expect(await resolve(actor.identityId)).toEqual(visible([inside, extra]));
  const unassign = await f.request(`/members/${actor.identityId}`, "PATCH", {
    version: 2,
    departmentId: null,
  });
  expect(unassign.status).toBe(200);
  expect(await resolve(actor.identityId)).toEqual(visible([]));
});

it("真实角色保存接口改变数据范围和动作后，已有范围缓存不能继续授权", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  const roleId = await f.role(actor.identityId, actor.orgId, "personal");
  const school = await f.school();
  expect(await resolve(actor.identityId)).toEqual(visible([]));
  const input = roleInput(await f.detail(roleId));
  input.dataScope = "all";
  expect(
    (await f.request(`/roles/${roleId}/grants`, "PUT", input)).status,
  ).toBe(200);
  await allowed(actor.identityId, school);
  const revoke = roleInput(await f.detail(roleId));
  revoke.grants = revoke.grants.map((g) => ({
    ...g,
    grant: { level: "none" },
  }));
  expect(
    (await f.request(`/roles/${roleId}/grants`, "PUT", revoke)).status,
  ).toBe(200);
  await expect(allowed(actor.identityId, school)).rejects.toMatchObject({
    code: 11101,
  });
});

it("学校和区划变更即使没有显式广播，也不能复用旧学校集合", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  await f.role(actor.identityId, actor.orgId, "personal");
  await f.personal(actor.identityId, "region", "990200");
  const a = await f.school("990200");
  expect(await resolve(actor.identityId)).toMatchObject({
    schoolIds: expect.arrayContaining([a]),
  });
  await f.pool.query("UPDATE public.orgs SET status=0 WHERE id=$1", [a]);
  await expect(allowed(actor.identityId, a)).rejects.toMatchObject({
    code: 90004,
  });
  await f.pool.query("UPDATE public.orgs SET status=1 WHERE id=$1", [a]);
  await allowed(actor.identityId, a);
  await f.pool.query("UPDATE public.regions SET status=0 WHERE code='990200'");
  expect(await resolve(actor.identityId)).toEqual(visible([]));
  await f.pool.query("UPDATE public.regions SET status=1 WHERE code='990200'");
  const b = await f.school("990200");
  expect(await resolve(actor.identityId)).toMatchObject({
    schoolIds: expect.arrayContaining([a, b]),
  });
  await f.pool.query(
    "UPDATE public.regions SET parent_code='980000',path='980000.990200' WHERE code='990200'",
  );
  const bureau = await f.seed("bureau", "bureau-admin");
  const result = await scopes.resolve(bureau.identityId, "ops:school:view");
  if (result.kind !== "schools") throw new Error("教育局范围类型错误");
  expect(result.schoolIds).not.toContain(a);
  await f.pool.query(
    "UPDATE public.regions SET parent_code='990000',path='990000.990200' WHERE code='990200'",
  );
});

it("另一实例读取真实角色和范围变更，撤权不复用已有范围缓存", async () => {
  const db = drizzle(f.pool);
  const contexts = new IdentityContextService(
    new ContextRepository(db),
    new RolesService(new RolesRepository(db)),
    f.config,
  );
  const second = new ScopeService(new ScopeRepository(db), contexts, f.config);
  await contexts.onModuleInit();
  try {
    const actor = await f.seed("company", null, f.admin.orgId);
    const role = await f.role(actor.identityId, actor.orgId, "personal");
    const school = await f.school();
    await f.personal(actor.identityId, "school", school);
    expect(await resolve(actor.identityId)).toEqual(visible([school]));
    expect(
      await second.resolve(actor.identityId, "school:student:view"),
    ).toEqual(visible([school]));
    await f.pool.query(
      "DELETE FROM public.identity_scopes WHERE identity_id=$1",
      [actor.identityId],
    );
    expect(
      await second.resolve(actor.identityId, "school:student:view"),
    ).toEqual(visible([]));
    await f.pool.query("UPDATE public.roles SET status=0 WHERE id=$1", [role]);
    await expect(resolve(actor.identityId)).rejects.toMatchObject({
      code: 11101,
    });
    await expect(
      second.resolve(actor.identityId, "school:student:view"),
    ).rejects.toMatchObject({ code: 11101 });
  } finally {
    second.onApplicationShutdown();
    await contexts.onApplicationShutdown();
  }
});

it("计算期间范围被收回时，旧计算既不能返回也不能回填", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  await f.role(actor.identityId, actor.orgId, "personal");
  const school = await f.school();
  await f.personal(actor.identityId, "school", school);
  const repository = f.app.get(ScopeRepository);
  const original = repository.personalSelections.bind(repository);
  let reached!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((r) => {
    reached = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const spy = vi
    .spyOn(repository, "personalSelections")
    .mockImplementationOnce(async (id) => {
      const rows = await original(id);
      reached();
      await gate;
      return rows;
    });
  try {
    const pending = resolve(actor.identityId);
    await ready;
    await f.pool.query(
      "DELETE FROM public.identity_scopes WHERE identity_id=$1",
      [actor.identityId],
    );
    await f.app.get(IdentityContextService).invalidate([actor.identityId]);
    release();
    expect(await pending).toEqual(visible([]));
    expect(await resolve(actor.identityId)).toEqual(visible([]));
    const raw = JSON.parse(
      (await redis.get(`scope:${actor.identityId}:personal`)) ?? "null",
    );
    expect(raw.scope).toEqual(visible([]));
  } finally {
    release();
    spy.mockRestore();
  }
});

it("尚未开放的身份类型安全返回空范围，不临时扩大为本校或全部", async () => {
  for (const [type, role] of [
    ["school", "school-admin"],
    ["agent", "agent-admin"],
  ] as const) {
    const actor = await f.seed(type, role);
    expect(await resolve(actor.identityId)).toEqual(visible([]));
    await expect(allowed(actor.identityId, actor.orgId)).rejects.toMatchObject({
      code: 90004,
    });
  }
});

it("真实区划展开大于500所学校时使用Set，学校停用后重算并清理副键", async () => {
  await f.pool.query(
    "INSERT INTO public.regions(code,name,level,parent_code,path) VALUES('990300','大范围测试市',2,'990000','990000.990300')",
  );
  const ids = Array.from({ length: 501 }, () => v7()).sort();
  const first = ids[0];
  if (!first) throw new Error("缺少测试学校");
  await f.pool.query(
    "INSERT INTO public.orgs(id,type,name,code,region_code) SELECT id,'school','大范围测试学校',id::text,'990300' FROM unnest($1::uuid[]) AS t(id)",
    [ids],
  );
  const actor = await f.seed("company", null, f.admin.orgId);
  await f.role(actor.identityId, actor.orgId, "personal");
  await f.personal(actor.identityId, "region", "990300");
  expect(await resolve(actor.identityId)).toEqual(visible(ids));
  const key = `scope:${actor.identityId}:personal:schools`;
  expect(await redis.scard(key)).toBe(501);
  const times: number[] = [];
  for (let i = 0; i < 150; i++) {
    const start = performance.now();
    await allowed(actor.identityId, first);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.info(
    `VisibleScope 501所学校Set命中（150次，含权限与数据库版本校验）：p50=${times[75]?.toFixed(2)}ms，p95=${times[142]?.toFixed(2)}ms`,
  );
  await f.pool.query("UPDATE public.orgs SET status=0 WHERE id=$1", [first]);
  await expect(allowed(actor.identityId, first)).rejects.toMatchObject({
    code: 90004,
  });
  expect(await resolve(actor.identityId)).toEqual(visible(ids.slice(1)));
  expect(await redis.exists(key)).toBe(0);
});

it("稳定版本命中范围缓存而不重新展开，并记录真实热路径耗时", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  await f.role(actor.identityId, actor.orgId, "personal");
  const school = await f.school();
  await f.personal(actor.identityId, "school", school);
  await allowed(actor.identityId, school);
  const spy = vi.spyOn(f.app.get(ScopeRepository), "personalSelections");
  const times: number[] = [];
  try {
    for (let i = 0; i < 150; i++) {
      const start = performance.now();
      await allowed(actor.identityId, school);
      times.push(performance.now() - start);
    }
    expect(spy).not.toHaveBeenCalled();
    times.sort((a, b) => a - b);
    console.info(
      `VisibleScope 热路径（150次，含权限与数据库版本校验）：p50=${times[75]?.toFixed(2)}ms，p95=${times[142]?.toFixed(2)}ms`,
    );
  } finally {
    spy.mockRestore();
  }
});

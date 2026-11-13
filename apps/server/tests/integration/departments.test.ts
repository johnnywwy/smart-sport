import {
  apiResponseSchema,
  type Department,
  departmentSchema,
  departmentTreeSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { Redis } from "ioredis";
import { v7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DepartmentPresetsService } from "../../src/modules/platform/departments/index.js";
import { IdentityContextService } from "../../src/modules/platform/identity-context/index.js";
import { roleManagementFixture } from "../helpers/role-management.js";

let f: Awaited<ReturnType<typeof roleManagementFixture>>;
let redis: Redis;
beforeAll(async () => {
  f = await roleManagementFixture();
  redis = new Redis(f.config.REDIS_URL);
  await f.app.get(DepartmentPresetsService).initializeCompany(f.admin.orgId);
}, 120000);
afterAll(async () => {
  redis?.disconnect();
  await f?.stop();
}, 30000);
const parsed = async (r: Response) =>
  successResponseSchema(departmentSchema).parse(await r.json()).data;
const errorCode = async (r: Response, status: number, code: number) => {
  expect(r.status).toBe(status);
  expect(apiResponseSchema.parse(await r.json()).code).toBe(code);
};
async function create(
  name = `部门${v7()}`,
  parentId?: string,
  token = f.admin.token,
  query = "",
) {
  const r = await f.request(
    `/departments${query}`,
    "POST",
    { name, ...(parentId ? { parentId } : {}) },
    token,
  );
  expect(r.status).toBe(201);
  return parsed(r);
}
async function tree(token = f.admin.token, query = "") {
  const r = await f.request(
    `/departments/tree${query}`,
    "GET",
    undefined,
    token,
  );
  expect(r.status).toBe(200);
  return successResponseSchema(departmentTreeSchema).parse(await r.json()).data;
}
const patch = (
  row: Department,
  changes: Record<string, unknown>,
  token = f.admin.token,
  query = "",
) =>
  f.request(
    `/departments/${row.id}${query}`,
    "PATCH",
    { version: row.version, ...changes },
    token,
  );
const remove = (row: Department, token = f.admin.token) =>
  f.request(
    `/departments/${row.id}`,
    "DELETE",
    { version: row.version },
    token,
  );

describe("部门树真实鉴权与事务", () => {
  it("教育局与代理商各管本组织，查询和写权限撤销后同一令牌立即失效", async () => {
    const bureau = await f.seed("bureau", "bureau-admin");
    const agent = await f.seed("agent", "agent-admin");
    const a = await create("教育局内设科室", undefined, bureau.token);
    const b = await create("代理商运营部", undefined, agent.token);
    expect((await tree(bureau.token)).items.map((row) => row.id)).toEqual([
      a.id,
    ]);
    expect((await tree(agent.token)).items.map((row) => row.id)).toEqual([
      b.id,
    ]);
    await errorCode(
      await patch(a, { name: "跨组织" }, agent.token),
      404,
      90004,
    );
    expect((await patch(b, { name: "运营一部" }, agent.token)).status).toBe(
      200,
    );
    await f.pool.query(
      "DELETE FROM public.identity_roles WHERE identity_id=$1",
      [agent.identityId],
    );
    await errorCode(
      await f.request("/departments/tree", "GET", undefined, agent.token),
      403,
      11101,
    );
    await errorCode(
      await patch({ ...b, version: 1 }, { name: "撤权后写入" }, agent.token),
      403,
      11101,
    );
    expect(
      (
        await f.pool.query(
          "SELECT name,version FROM public.departments WHERE id=$1",
          [b.id],
        )
      ).rows[0],
    ).toEqual({ name: "运营一部", version: 1 });
  });

  it("公司预置部门初始化幂等，改名排序后不重新创建，预置禁止删除", async () => {
    const rows = (await tree()).items;
    const presets = rows.filter((r) => r.isPreset);
    expect(presets.map((r) => r.name)).toEqual([
      "研发部",
      "销售部",
      "生产部",
      "技术服务部",
    ]);
    const first = presets[0];
    if (!first) throw new Error("无预置部门");
    expect(first.allowedActions).toEqual(["create", "update"]);
    await errorCode(await remove(first), 403, 12007);
    const changed = await parsed(
      await patch(first, { name: "研发中心", sort: 9 }),
    );
    await Promise.all([
      f.app.get(DepartmentPresetsService).initializeCompany(f.admin.orgId),
      f.app.get(DepartmentPresetsService).initializeCompany(f.admin.orgId),
    ]);
    const after = (await tree()).items.filter((r) => r.isPreset);
    expect(after).toHaveLength(4);
    expect(after.find((r) => r.id === first.id)).toMatchObject({
      name: "研发中心",
      sort: 9,
      version: changed.version,
    });
  });
  it("新增幂等按已验证组织隔离，重放仅一条部门与一条审计", async () => {
    const key = v7(),
      body = { name: "幂等新增" };
    const r = await f.request("/departments", "POST", body, undefined, key);
    expect(r.status).toBe(201);
    const row = await parsed(r);
    const replay = await f.request(
      "/departments",
      "POST",
      body,
      undefined,
      key,
    );
    expect(replay.status).toBe(409);
    const data = apiResponseSchema.parse(await replay.json());
    expect(data.code).toBe(90003);
    expect(departmentSchema.parse(data.data)).toEqual(row);
    expect(
      (
        await f.pool.query(
          "SELECT * FROM public.audit_logs WHERE target_id=$1",
          [row.id],
        )
      ).rowCount,
    ).toBe(1);
    const other = await f.seed("school", "school-admin");
    const r2 = await f.request(
      `/departments?orgId=${other.orgId}`,
      "POST",
      body,
      undefined,
      key,
    );
    expect(r2.status).toBe(201);
    expect((await parsed(r2)).id).not.toBe(row.id);
  });
  it("移动多层部门同步子孙路径和版本，改名排序不改子孙，支持移回根", async () => {
    const a = await create("树A"),
      b = await create("树B"),
      c = await create("子C", a.id),
      d = await create("孙D", c.id),
      e = await create("曾孙E", d.id);
    const moved = await parsed(await patch(c, { parentId: b.id, sort: 3 }));
    expect(moved).toMatchObject({ parentId: b.id, version: 1, sort: 3 });
    const stored = await f.pool.query(
      "SELECT id,path,version FROM public.departments WHERE id=ANY($1::uuid[]) ORDER BY path",
      [[c.id, d.id, e.id]],
    );
    expect(stored.rows).toEqual([
      { id: c.id, path: `${b.id}.${c.id}`, version: 1 },
      { id: d.id, path: `${b.id}.${c.id}.${d.id}`, version: 1 },
      { id: e.id, path: `${b.id}.${c.id}.${d.id}.${e.id}`, version: 1 },
    ]);
    await errorCode(await patch(d, { name: "旧版本" }), 409, 90002);
    const renamed = await parsed(await patch(moved, { name: "移动后" }));
    expect(
      (
        await f.pool.query(
          "SELECT version FROM public.departments WHERE id=$1",
          [d.id],
        )
      ).rows[0].version,
    ).toBe(1);
    expect((await patch(renamed, { parentId: null })).status).toBe(200);
    expect(
      (
        await f.pool.query(
          "SELECT path,version FROM public.departments WHERE id=$1",
          [e.id],
        )
      ).rows[0],
    ).toEqual({ path: `${c.id}.${d.id}.${e.id}`, version: 2 });
    const audit = await f.pool.query(
      "SELECT action,changes FROM public.audit_logs WHERE target_id=$1 AND action='department.move'",
      [c.id],
    );
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows[0].changes.descendantCount).toBe(2);
  });
  it("禁止移到自己或后代，并发交叉移动只允许一方成功且不会成环", async () => {
    const a = await create(),
      b = await create(undefined, a.id),
      c = await create(undefined, b.id);
    for (const parentId of [a.id, b.id, c.id])
      await errorCode(await patch(a, { parentId }), 409, 12003);
    const x = await create(),
      y = await create();
    const results = await Promise.all([
      patch(x, { parentId: y.id }),
      patch(y, { parentId: x.id }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    await errorCode(
      results.find((r) => r.status === 409) as Response,
      409,
      12003,
    );
    const stored = await f.pool.query(
      "SELECT id,parent_id,path FROM public.departments WHERE id=ANY($1::uuid[])",
      [[x.id, y.id]],
    );
    expect(stored.rows.filter((r) => r.parent_id === null)).toHaveLength(1);
  });
  it("同级重名拒绝，跨层级可同名；移动和重命名也校验，软删后可重建", async () => {
    const name = `重名${v7()}`,
      a = await create(name),
      parent = await create(),
      b = await create(name, parent.id);
    await errorCode(
      await f.request("/departments", "POST", { name }),
      409,
      12001,
    );
    await errorCode(await patch(b, { parentId: null }), 409, 12001);
    const c = await create();
    await errorCode(await patch(c, { name }), 409, 12001);
    expect((await remove(a)).status).toBe(200);
    expect((await create(name)).id).not.toBe(a.id);
    await errorCode(await patch(a, { name: "已删除" }), 404, 90004);
  });
  it("更新删除乐观锁，并发更新只有一次成功，失败不写审计", async () => {
    const a = await create();
    const results = await Promise.all([
      patch(a, { sort: 1 }),
      patch(a, { sort: 2 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    await errorCode(await remove(a), 409, 90002);
    const row = await parsed(results.find((r) => r.status === 200) as Response);
    expect((await remove(row)).status).toBe(200);
    const audits = await f.pool.query(
      "SELECT action FROM public.audit_logs WHERE target_id=$1 ORDER BY created_at",
      [a.id],
    );
    expect(audits.rows.map((r) => r.action)).toEqual([
      "department.create",
      "department.update",
      "department.delete",
    ]);
  });
  it("有子部门或停用成员禁止删除；已软删成员不阻止删除，行能力与实际约束一致", async () => {
    const parent = await create(),
      child = await create(undefined, parent.id);
    await errorCode(await remove(parent), 409, 12002);
    expect(
      (await tree()).items.find((r) => r.id === parent.id)?.allowedActions,
    ).not.toContain("delete");
    const member = await f.seed("company", null, f.admin.orgId);
    await f.pool.query(
      "UPDATE public.identities SET department_id=$1,status=0 WHERE id=$2",
      [child.id, member.identityId],
    );
    await errorCode(await remove(child), 409, 12002);
    await f.pool.query(
      "UPDATE public.identities SET deleted_at=now() WHERE id=$1",
      [member.identityId],
    );
    expect((await remove(child)).status).toBe(200);
    expect((await remove(parent)).status).toBe(200);
  });
  it("人数按直属去重账号统计，学校和教师双身份不重复，摘要来自真实范围记录", async () => {
    const school = await f.seed("school", "school-admin");
    const dep = await create("教研组", undefined, school.token);
    await f.pool.query(
      "UPDATE public.identities SET department_id=$1 WHERE id=$2",
      [dep.id, school.identityId],
    );
    await f.pool.query(
      "INSERT INTO public.identities(id,user_id,org_id,type,department_id) SELECT $1,user_id,org_id,'teacher',$2 FROM public.identities WHERE id=$3",
      [v7(), dep.id, school.identityId],
    );
    const unassigned = await f.seed("school", null, school.orgId);
    await f.pool.query(
      "INSERT INTO public.department_scopes(department_id,scope_type,scope_value) VALUES($1,'grade','13'),($1,'grade','14'),($1,'college',$2)",
      [dep.id, v7()],
    );
    const result = await tree(school.token);
    expect(result.unassignedMemberCount).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      memberCount: 1,
      scopeSummary: expect.arrayContaining([
        { type: "grade", count: 2 },
        { type: "college", count: 1 },
      ]),
    });
    await f.pool.query(
      "UPDATE public.identities SET deleted_at=now() WHERE id=$1",
      [unassigned.identityId],
    );
    expect((await tree(school.token)).unassignedMemberCount).toBe(0);
  });
  it("跨组织部门或上级返回404，普通公司即使全功能也不能指定orgId，超管可以", async () => {
    const school = await f.seed("school", "school-admin");
    const dep = await create(undefined, undefined, school.token);
    expect((await tree()).items.some((r) => r.id === dep.id)).toBe(false);
    await errorCode(await patch(dep, { name: "越权" }), 404, 90004);
    await errorCode(await remove(dep), 404, 90004);
    await errorCode(
      await f.request("/departments", "POST", {
        name: "越权",
        parentId: dep.id,
      }),
      404,
      90004,
    );
    const local = await create();
    await errorCode(await patch(local, { parentId: dep.id }), 404, 90004);
    const ordinary = await f.seed("company", null);
    // 使用明确声明的自定义角色赋予全部部门动作，不能借此获得超管组织例外。
    const role = v7();
    await f.pool.query(
      "INSERT INTO public.roles(id,kind,base_role_id,identity_type,org_id,code,name,data_scope) SELECT $1::uuid,'custom',id,'company',$2::uuid,$1::uuid::text,'部门管理','all' FROM public.roles WHERE code='company-super-admin'",
      [role, ordinary.orgId],
    );
    await f.pool.query(
      "INSERT INTO public.identity_roles(identity_id,role_id) VALUES($1,$2)",
      [ordinary.identityId, role],
    );
    expect(
      (await f.request("/departments/tree", "GET", undefined, ordinary.token))
        .status,
    ).toBe(200);
    for (const token of [ordinary.token, school.token])
      await errorCode(
        await f.request(
          `/departments/tree?orgId=${school.orgId}`,
          "GET",
          undefined,
          token,
        ),
        403,
        11101,
      );
    expect(
      (await tree(f.admin.token, `?orgId=${school.orgId}`)).items.some(
        (r) => r.id === dep.id,
      ),
    ).toBe(true);
    expect(
      (
        await patch(
          dep,
          { name: "平台代管" },
          f.admin.token,
          `?orgId=${school.orgId}`,
        )
      ).status,
    ).toBe(200);
    await errorCode(
      await f.request(`/departments/tree?orgId=${v7()}`),
      404,
      90004,
    );
  });
  it("无功能403，账号令牌401，只读成员没有写行能力，非法系统字段400", async () => {
    const viewer = await f.seed("company", "company-readonly-auditor"),
      empty = await f.seed("company", null);
    const row = await create();
    const target = await create(
      undefined,
      undefined,
      f.admin.token,
      `?orgId=${viewer.orgId}`,
    );
    expect(
      (await tree(viewer.token)).items.find((r) => r.id === target.id)
        ?.allowedActions,
    ).toEqual([]);
    for (const [path, method, body] of [
      ["/departments/tree", "GET", undefined],
      ["/departments", "POST", { name: "禁止" }],
      [`/departments/${row.id}`, "PATCH", { version: 0, name: "禁止" }],
      [`/departments/${row.id}`, "DELETE", { version: 0 }],
    ] as const) {
      await errorCode(
        await f.request(path, method, body, empty.token),
        403,
        11101,
      );
      expect((await f.request(path, method, body, empty.account)).status).toBe(
        401,
      );
      if (method !== "GET")
        await errorCode(
          await f.request(path, method, body, viewer.token),
          403,
          11101,
        );
    }
    await errorCode(
      await f.request("/departments", "POST", { name: "禁止", code: "bad" }),
      400,
      90001,
    );
    await errorCode(
      await f.request(`/departments/${row.id}`, "PATCH", { version: 0 }),
      400,
      90001,
    );
  });
  it("部门变更推进数据库与Redis失效屏障，外键拒绝跨组织或已删部门分配", async () => {
    const revision = async () =>
      Number(
        (
          await f.pool.query(
            "SELECT version FROM public.identity_context_revision",
          )
        ).rows[0].version,
      );
    const beforeDb = await revision(),
      beforeRedis = Number(await redis.get("ctx:revision"));
    const row = await create();
    expect(await revision()).toBeGreaterThan(beforeDb);
    expect(Number(await redis.get("ctx:revision"))).toBeGreaterThan(
      beforeRedis,
    );
    const ctx = f.app.get(IdentityContextService);
    await ctx.load(f.admin.identityId);
    const old = JSON.parse(
      (await redis.get(`ctx:${f.admin.identityId}`)) ?? "null",
    );
    expect((await patch(row, { sort: 8 })).status).toBe(200);
    await ctx.load(f.admin.identityId);
    const next = JSON.parse(
      (await redis.get(`ctx:${f.admin.identityId}`)) ?? "null",
    );
    expect(next.revision).not.toBe(old.revision);
    const other = await f.seed("school", "school-admin");
    await expect(
      f.pool.query(
        "UPDATE public.identities SET department_id=$1 WHERE id=$2",
        [row.id, other.identityId],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    const deleted = await create();
    expect((await remove(deleted)).status).toBe(200);
    await expect(
      f.pool.query(
        "UPDATE public.identities SET department_id=$1 WHERE id=$2",
        [deleted.id, f.admin.identityId],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
  it("并发删除与分配成员只会一方成功，不留活跃身份引用软删部门", async () => {
    const row = await create(),
      member = await f.seed("company", null, f.admin.orgId);
    const results = await Promise.allSettled([
      remove(row),
      f.pool.query(
        "UPDATE public.identities SET department_id=$1 WHERE id=$2",
        [row.id, member.identityId],
      ),
    ]);
    const dangling = await f.pool.query(
      "SELECT i.id FROM public.identities i JOIN public.departments d ON d.id=i.department_id WHERE i.deleted_at IS NULL AND d.deleted_at IS NOT NULL AND d.id=$1",
      [row.id],
    );
    expect(dangling.rowCount).toBe(0);
    const deletion = results[0];
    expect(deletion.status).toBe("fulfilled");
    if (deletion.status === "fulfilled")
      expect([200, 409]).toContain(deletion.value.status);
    const assigned = results[1];
    if (assigned.status === "rejected")
      expect(assigned.reason.code).toBe("23503");
    else if (deletion.status === "fulfilled")
      expect(deletion.value.status).toBe(409);
  });
});

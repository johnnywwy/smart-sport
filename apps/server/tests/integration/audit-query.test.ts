import {
  auditLogListSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { AuditQueryRepository } from "../../src/modules/platform/audit/index.js";
import {
  roleInput,
  roleManagementFixture,
} from "../helpers/role-management.js";

let f: Awaited<ReturnType<typeof roleManagementFixture>>;
let school: Awaited<ReturnType<typeof f.seed>>;
let foreign: Awaited<ReturnType<typeof f.seed>>;
const targetId = v7();
const ids = [v7(), v7(), v7(), v7()];
beforeAll(async () => {
  f = await roleManagementFixture();
  school = await f.seed("school", "school-admin");
  foreign = await f.seed("school", "school-admin");
  for (const [index, actor] of [f.admin, school, foreign].entries()) {
    await f.pool.query(
      `INSERT INTO public.audit_logs(id,user_id,identity_id,org_id,school_id,action,target_type,target_id,changes,created_at) VALUES($1,$2,$3,$4,$5,'test.audit.query','role',$6,$7,'2026-11-18T08:00:00Z')`,
      [
        ids[index],
        actor.userId,
        actor.identityId,
        actor.orgId,
        index ? actor.orgId : null,
        targetId,
        JSON.stringify({
          before: { name: "旧名称", phone: "13800138000" },
          after: { name: "新名称", phone: "13900139000" },
          email: "private@example.com",
          nested: { access_token: "secret" },
        }),
      ],
    );
  }
  await f.pool.query(
    `INSERT INTO public.audit_logs(id,action,target_type,target_id,changes,created_at) VALUES($1,'test.audit.query','role',$2,NULL,'2026-11-18T08:00:01Z')`,
    [ids[3], targetId],
  );
}, 120000);
afterAll(async () => {
  await f?.stop();
}, 30000);
async function list(query = "", token = f.admin.token) {
  const r = await f.request(`/audit-logs?${query}`, "GET", undefined, token);
  expect(r.status).toBe(200);
  return successResponseSchema(auditLogListSchema).parse(await r.json()).data;
}
it("全平台与本组织返回真实归属，组织计数和对象查询均无法跨界", async () => {
  const all = await list("scope=platform&action=test.audit.query");
  expect(all.total).toBe(4);
  expect(all.items.map((r) => r.id).sort()).toEqual([...ids].sort());
  expect(all.items.find((r) => r.id === ids[3])).toMatchObject({
    userId: null,
    orgId: null,
    identityType: null,
    operatorName: null,
  });
  const local = await list("action=test.audit.query", school.token);
  expect(local.total).toBe(1);
  expect(local.items[0]).toMatchObject({
    id: ids[1],
    orgId: school.orgId,
    schoolId: school.orgId,
    identityType: "school",
    operatorName: "角色测试",
    schoolName: "角色测试组织",
    allowedActions: [],
  });
  const target = await list(
    `action=test.audit.query&targetType=role&targetId=${targetId}`,
    school.token,
  );
  expect(target.items.map((r) => r.id)).toEqual([ids[1]]);
  expect(
    (
      await list(
        `action=test.audit.query&userId=${foreign.userId}`,
        school.token,
      )
    ).total,
  ).toBe(0);
  expect(
    (
      await list(
        `action=test.audit.query&targetType=missing&targetId=${targetId}`,
        school.token,
      )
    ).total,
  ).toBe(0);
});
it("读取历史敏感快照再次去值，不更改原始记录；停用或删除实体仍保留历史归属", async () => {
  await f.pool.query("UPDATE public.users SET deleted_at=now() WHERE id=$1", [
    foreign.userId,
  ]);
  await f.pool.query("UPDATE public.identities SET status=0 WHERE id=$1", [
    foreign.identityId,
  ]);
  const result = await list(
    `scope=platform&action=test.audit.query&userId=${foreign.userId.toUpperCase()}`,
  );
  expect(result.total).toBe(1);
  expect(result.items[0]).toMatchObject({
    orgId: foreign.orgId,
    identityId: foreign.identityId,
    operatorName: "角色测试",
    changes: {
      name: ["旧名称", "新名称"],
      phone: "已修改",
      email: "已修改",
      nested: { access_token: "已修改" },
    },
  });
  expect(JSON.stringify(result)).not.toContain("13800138000");
  expect(JSON.stringify(result)).not.toContain("private@example.com");
  expect(
    (
      await f.pool.query("SELECT changes FROM public.audit_logs WHERE id=$1", [
        ids[2],
      ])
    ).rows[0].changes.before.phone,
  ).toBe("13800138000");
});
it("相同时间按ID稳定分页，时间边界支持时区，动作精确匹配", async () => {
  const first = await list(
    "scope=platform&action=test.audit.query&pageSize=2&sort=createdAt:asc",
  );
  const second = await list(
    "scope=platform&action=test.audit.query&pageSize=2&page=2&sort=createdAt:asc",
  );
  expect([...first.items, ...second.items].map((r) => r.id)).toEqual(
    [...ids.slice(0, 3)].sort().concat(ids[3] ?? ""),
  );
  const exact = await list(
    "scope=platform&action=test.audit.query&from=2026-11-18T16%3A00%3A00%2B08%3A00&to=2026-11-18T08%3A00%3A00Z",
  );
  expect(exact.total).toBe(3);
  for (const action of ["test.audit", "%", "_", "' OR true --"])
    expect(
      (await list(`scope=platform&action=${encodeURIComponent(action)}`)).total,
    ).toBe(0);
});
it("认证和范围权限不可互相替代，非法筛选拒绝，客户端不能指定组织边界", async () => {
  expect(
    (
      await f.request(
        "/audit-logs?scope=platform",
        "GET",
        undefined,
        school.token,
      )
    ).status,
  ).toBe(403);
  const denied = await f.seed("company", null);
  expect(
    (await f.request("/audit-logs", "GET", undefined, denied.token)).status,
  ).toBe(403);
  expect(
    (await f.request("/audit-logs", "GET", undefined, f.admin.account)).status,
  ).toBe(401);
  expect((await fetch(`${f.base}/api/v1/audit-logs`)).status).toBe(401);
  for (const query of [
    "pageSize=101",
    "scope=all",
    `orgId=${foreign.orgId}`,
    "from=bad",
    "from=2026-11-19T00:00:00Z&to=2026-11-18T00:00:00Z",
    `targetId=${targetId}`,
  ]) {
    expect((await f.request(`/audit-logs?${query}`)).status).toBe(400);
  }
});
async function readonlyRole() {
  const actor = await f.seed("company", null, f.admin.orgId);
  const roleId = v7();
  await f.pool.query(
    `INSERT INTO public.roles(id,kind,identity_type,org_id,code,name,data_scope,base_role_id) SELECT $1,'custom','company',$2,$1::uuid::text,'审计验收角色','all',id FROM public.roles WHERE code='company-super-admin'`,
    [roleId, actor.orgId],
  );
  await f.pool.query(
    `INSERT INTO public.role_grants(role_id,app_code,feature_code,level) SELECT $1,app_code,code,'none' FROM public.features`,
    [roleId],
  );
  await f.pool.query("INSERT INTO public.identity_roles VALUES($1,$2)", [
    actor.identityId,
    roleId,
  ]);
  return { ...actor, roleId };
}
it("通过真实角色接口授权撤权，同一令牌立即403→200→403，组织和平台权限独立", async () => {
  const actor = await readonlyRole();
  const path = "/audit-logs?scope=platform&action=test.audit.query";
  expect((await f.request(path, "GET", undefined, actor.token)).status).toBe(
    403,
  );
  for (const level of ["view", "none"] as const) {
    const input = roleInput(await f.detail(actor.roleId));
    input.grants = input.grants.map((g) =>
      g.app === "system" && g.feature === "audit"
        ? { ...g, grant: { level } }
        : g,
    );
    expect(
      (await f.request(`/roles/${actor.roleId}/grants`, "PUT", input)).status,
    ).toBe(200);
    expect((await f.request(path, "GET", undefined, actor.token)).status).toBe(
      level === "view" ? 200 : 403,
    );
    expect(
      (await f.request("/audit-logs", "GET", undefined, actor.token)).status,
    ).toBe(403);
  }
});
it("读取期间撤销权限，丢弃已取得的旧结果，不向客户端泄露", async () => {
  const actor = await readonlyRole();
  const input = roleInput(await f.detail(actor.roleId));
  input.grants = input.grants.map((g) =>
    g.app === "system" && g.feature === "audit"
      ? { ...g, grant: { level: "view" } }
      : g,
  );
  expect(
    (await f.request(`/roles/${actor.roleId}/grants`, "PUT", input)).status,
  ).toBe(200);
  const repository = f.app.get(AuditQueryRepository);
  const original = repository.list.bind(repository);
  const spy = vi
    .spyOn(repository, "list")
    .mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      const update = roleInput(await f.detail(actor.roleId));
      update.grants = update.grants.map((g) =>
        g.app === "system" && g.feature === "audit"
          ? { ...g, grant: { level: "none" } }
          : g,
      );
      expect(
        (await f.request(`/roles/${actor.roleId}/grants`, "PUT", update))
          .status,
      ).toBe(200);
      return result;
    });
  try {
    const r = await f.request(
      "/audit-logs?scope=platform",
      "GET",
      undefined,
      actor.token,
    );
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ code: 11101, data: null });
  } finally {
    spy.mockRestore();
  }
});

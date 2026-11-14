import {
  apiResponseSchema,
  createMemberResponseSchema,
  loginResponseSchema,
  refreshAccessTokenSchema,
  selectIdentityResponseSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { v7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  roleInput,
  roleManagementFixture,
} from "../helpers/role-management.js";

let fixture: Awaited<ReturnType<typeof roleManagementFixture>>;
beforeAll(async () => {
  fixture = await roleManagementFixture(true);
}, 120000);
afterAll(async () => {
  await fixture?.stop();
}, 30000);
const account = () => ({
  mode: "new",
  username: `permission-${v7()}`,
  realName: "权限验收",
});
async function role(code: string) {
  const result = await fixture.pool.query(
    "SELECT id FROM public.roles WHERE code=$1",
    [code],
  );
  if (!result.rows[0]) throw new Error("测试角色不存在");
  return result.rows[0].id as string;
}
async function rejected(response: Response, status: number, code: number) {
  expect(response.status).toBe(status);
  expect(apiResponseSchema.parse(await response.json()).code).toBe(code);
}
async function create(body: unknown, token = fixture.admin.token, query = "") {
  const response = await fixture.request(
    `/members${query}`,
    "POST",
    body,
    token,
  );
  expect(response.status).toBe(201);
  return successResponseSchema(createMemberResponseSchema).parse(
    await response.json(),
  ).data;
}
async function login(username: string, password: string) {
  const response = await fixture.request("/auth/login", "POST", {
    account: username,
    password,
  });
  expect(response.status).toBe(200);
  return {
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    ...successResponseSchema(loginResponseSchema).parse(await response.json())
      .data,
  };
}
async function select(token: string, identityId: string) {
  const response = await fixture.request(
    "/auth/select-identity",
    "POST",
    { identityId },
    token,
  );
  expect(response.status).toBe(201);
  return successResponseSchema(selectIdentityResponseSchema).parse(
    await response.json(),
  ).data.accessToken;
}

describe("成员写入的真实鉴权与组织边界", () => {
  it("新账号登录改密后，同一令牌随角色调整即时生效，停用仅吊销当前身份的会话", async () => {
    const readonly = await role("company-readonly-auditor");
    const input = {
      ...account(),
      phone: "13900009999",
      email: "permission@example.test",
    };
    const created = await create({ account: input, roleIds: [readonly] });
    const first = await login(input.phone, created.initialPassword ?? "");
    expect(first.mustChangePassword).toBe(true);
    expect(first.selectedIdentity).toBeNull();
    const password = `Changed-${v7()}`;
    const changed = await fetch(`${fixture.base}/api/v1/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: first.cookie,
        Authorization: `Bearer ${first.accessToken}`,
      },
      body: JSON.stringify({
        oldPassword: created.initialPassword,
        newPassword: password,
      }),
    });
    expect(changed.status).toBe(200);
    const refreshed = await fetch(`${fixture.base}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { Cookie: first.cookie },
    });
    expect(refreshed.status).toBe(200);
    const companyCookie =
      refreshed.headers.get("set-cookie")?.split(";")[0] ?? "";
    const fresh = successResponseSchema(refreshAccessTokenSchema).parse(
      await refreshed.json(),
    ).data;
    const companyToken = await select(fresh.accessToken, created.member.id);
    expect(
      (await fixture.request("/members", "GET", undefined, companyToken))
        .status,
    ).toBe(200);
    await rejected(
      await fixture.request(
        `/members/${created.member.id}`,
        "PATCH",
        {
          version: 0,
          title: "不能修改",
        },
        companyToken,
      ),
      403,
      11101,
    );
    expect(
      (
        await fixture.request(`/members/${created.member.id}`, "PATCH", {
          version: 0,
          roleIds: [],
        })
      ).status,
    ).toBe(200);
    await rejected(
      await fixture.request("/members", "GET", undefined, companyToken),
      403,
      11101,
    );
    expect(
      (
        await fixture.request(`/members/${created.member.id}`, "PATCH", {
          version: 1,
          roleIds: [readonly],
        })
      ).status,
    ).toBe(200);
    expect(
      (await fixture.request("/members", "GET", undefined, companyToken))
        .status,
    ).toBe(200);
    const school = await fixture.seed("school", "school-admin");
    const added = await create(
      {
        account: { mode: "existing", account: input.phone },
        roleIds: [await role("school-admin")],
      },
      school.token,
    );
    const another = await login(input.email, password);
    const schoolToken = await select(another.accessToken, added.member.id);
    expect(
      (await fixture.request("/members", "GET", undefined, schoolToken)).status,
    ).toBe(200);
    const before = (
      await fixture.pool.query("SELECT * FROM public.users WHERE id=$1", [
        created.member.userId,
      ])
    ).rows[0];
    expect(
      (
        await fixture.request(`/members/${created.member.id}/status`, "POST", {
          version: 2,
          status: 0,
        })
      ).status,
    ).toBe(200);
    await rejected(
      await fixture.request("/members", "GET", undefined, companyToken),
      401,
      10005,
    );
    await rejected(
      await fetch(`${fixture.base}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { Cookie: companyCookie },
      }),
      401,
      10005,
    );
    expect(
      (await fixture.request("/members", "GET", undefined, schoolToken)).status,
    ).toBe(200);
    expect(
      (
        await fixture.pool.query("SELECT * FROM public.users WHERE id=$1", [
          created.member.userId,
        ])
      ).rows[0],
    ).toEqual(before);
    expect(
      (
        await fixture.pool.query(
          "SELECT status,version FROM public.identities WHERE id=$1",
          [added.member.id],
        )
      ).rows[0],
    ).toEqual({ status: 1, version: 0 });
    expect(
      (
        await fixture.request(`/members/${created.member.id}/status`, "POST", {
          version: 3,
          status: 1,
        })
      ).status,
    ).toBe(200);
    // 重新启用不复活已吊销的旧会话，必须重新登录。
    await rejected(
      await fixture.request("/members", "GET", undefined, companyToken),
      401,
      10005,
    );
  });

  it("上级教育局只能为严格下级开通首个管理员，重放保留幂等结果且不能读取或修改下局成员", async () => {
    await fixture.pool.query(
      "INSERT INTO public.regions(code,name,level,parent_code,path) VALUES('990100','测试市',2,'990000','990000.990100'),('980000','另一省',1,NULL,'980000')",
    );
    const upper = await fixture.seed("bureau", "bureau-admin");
    const child = await fixture.seed("bureau", null);
    await fixture.pool.query(
      "UPDATE public.orgs SET region_code='990100' WHERE id=$1",
      [child.orgId],
    );
    const query = `?orgId=${child.orgId}`;
    const body = { account: account(), roleIds: [await role("bureau-admin")] };
    const key = v7();
    const response = await fixture.request(
      `/members${query}`,
      "POST",
      body,
      upper.token,
      key,
    );
    expect(response.status).toBe(201);
    const result = successResponseSchema(createMemberResponseSchema).parse(
      await response.json(),
    ).data;
    await rejected(
      await fixture.request(`/members${query}`, "POST", body, upper.token, key),
      409,
      90003,
    );
    await rejected(
      await fixture.request(
        `/members${query}`,
        "POST",
        { ...body, account: account() },
        upper.token,
      ),
      403,
      11101,
    );
    await rejected(
      await fixture.request(`/members${query}`, "GET", undefined, upper.token),
      403,
      11101,
    );
    await rejected(
      await fixture.request(
        `/members/${result.member.id}${query}`,
        "PATCH",
        { version: 0, title: "跨局修改" },
        upper.token,
      ),
      403,
      11101,
    );
    for (const code of ["990000", "980000"]) {
      const peer = await fixture.seed("bureau", null);
      await fixture.pool.query(
        "UPDATE public.orgs SET region_code=$1 WHERE id=$2",
        [code, peer.orgId],
      );
      await rejected(
        await fixture.request(
          `/members?orgId=${peer.orgId}`,
          "POST",
          { ...body, account: account() },
          upper.token,
        ),
        403,
        11101,
      );
    }
    const empty = await fixture.seed("bureau", null);
    await fixture.pool.query(
      "UPDATE public.orgs SET region_code='990100' WHERE id=$1",
      [empty.orgId],
    );
    await rejected(
      await fixture.request(
        `/members?orgId=${empty.orgId}`,
        "POST",
        { account: account() },
        upper.token,
      ),
      403,
      11101,
    );
    expect(
      (
        await fixture.pool.query(
          "SELECT count(*)::int total FROM public.audit_logs WHERE action='member.create' AND org_id=$1",
          [child.orgId],
        )
      ).rows[0].total,
    ).toBe(1);
  });

  it("外组织、停用及删除的自定义角色不能分配，已有教师只接受教师角色", async () => {
    const own = await fixture.seed("school", "school-admin");
    const foreign = await fixture.seed("school", "school-admin");
    const custom = await fixture.create("学校管理员", foreign.token);
    const target = await create({ account: account() }, own.token);
    await rejected(
      await fixture.request(
        `/members/${target.member.id}`,
        "PATCH",
        { version: 0, roleIds: [custom.id] },
        own.token,
      ),
      404,
      90004,
    );
    const local = await fixture.create("学校管理员", own.token);
    for (const update of ["status=0", "status=1,deleted_at=now()"]) {
      await fixture.pool.query(
        `UPDATE public.roles SET ${update} WHERE id=$1`,
        [local.id],
      );
      await rejected(
        await fixture.request(
          `/members/${target.member.id}`,
          "PATCH",
          { version: 0, roleIds: [local.id] },
          own.token,
        ),
        404,
        90004,
      );
    }
    await fixture.pool.query(
      "UPDATE public.identities SET type='teacher' WHERE id=$1",
      [target.member.id],
    );
    await rejected(
      await fixture.request(
        `/members/${target.member.id}`,
        "PATCH",
        { version: 0, roleIds: [await role("school-admin")] },
        own.token,
      ),
      404,
      90004,
    );
    const teacherRole = (
      await fixture.pool.query(
        "SELECT id FROM public.roles WHERE identity_type='teacher' AND kind='preset' LIMIT 1",
      )
    ).rows[0].id;
    expect(
      (
        await fixture.request(
          `/members/${target.member.id}`,
          "PATCH",
          { version: 0, roleIds: [teacherRole] },
          own.token,
        )
      ).status,
    ).toBe(200);
  });

  it("只有修改权限也可调整本组织成员；没有查询权限不能借接口读取列表", async () => {
    const custom = await fixture.create("超级管理员");
    const input = roleInput(custom);
    input.grants = input.grants.map((g) => ({
      ...g,
      grant:
        g.app === "org" && g.feature === "member"
          ? { level: "custom", actions: ["update"] }
          : { level: "none" },
    }));
    expect(
      (await fixture.request(`/roles/${custom.id}/grants`, "PUT", input))
        .status,
    ).toBe(200);
    const updater = await fixture.seed("company", null, fixture.admin.orgId);
    await fixture.pool.query(
      "INSERT INTO public.identity_roles(identity_id,role_id) VALUES($1,$2)",
      [updater.identityId, custom.id],
    );
    const target = await create({ account: account() });
    await rejected(
      await fixture.request("/members", "GET", undefined, updater.token),
      403,
      11101,
    );
    expect(
      (
        await fixture.request(
          `/members/${target.member.id}`,
          "PATCH",
          { version: 0, title: "仅修改者" },
          updater.token,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await fixture.request(
          `/members/${target.member.id}/status/`,
          "POST",
          { version: 1, status: 0 },
          updater.token,
        )
      ).status,
    ).toBe(200);
  });

  it("并发追加只创建一个身份，部门分配和删除不会留下悬挂关联", async () => {
    const school = await fixture.seed("school", "school-admin");
    const original = await create({ account: account() });
    const appended = await Promise.all(
      [1, 2].map(() =>
        fixture.request(
          "/members",
          "POST",
          {
            account: { mode: "existing", account: original.member.username },
          },
          school.token,
        ),
      ),
    );
    expect(appended.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      (
        await fixture.pool.query(
          "SELECT count(*)::int total FROM public.identities WHERE user_id=$1 AND org_id=$2",
          [original.member.userId, school.orgId],
        )
      ).rows[0].total,
    ).toBe(1);
    const target = await create({ account: account() }, school.token);
    const departmentResponse = await fixture.request(
      "/departments",
      "POST",
      { name: "并发部门" },
      school.token,
    );
    expect(departmentResponse.status).toBe(201);
    const department = apiResponseSchema.parse(await departmentResponse.json())
      .data as { id: string; version: number };
    const responses = await Promise.all([
      fixture.request(
        `/members/${target.member.id}`,
        "PATCH",
        { version: 0, departmentId: department.id },
        school.token,
      ),
      fixture.request(
        `/departments/${department.id}`,
        "DELETE",
        { version: department.version },
        school.token,
      ),
    ]);
    expect(responses.filter((r) => r.ok)).toHaveLength(1);
    expect(responses.every((r) => [200, 404, 409].includes(r.status))).toBe(
      true,
    );
    const dangling = await fixture.pool.query(
      "SELECT i.id FROM public.identities i JOIN public.departments d ON d.id=i.department_id WHERE i.id=$1 AND d.deleted_at IS NOT NULL",
      [target.member.id],
    );
    expect(dangling.rowCount).toBe(0);
  });
  it("缓存中的旧角色不能绕过事务内重读，拒绝后成员版本和审计不变", async () => {
    const owner = await fixture.seed("company", "company-super-admin");
    const target = await create({ account: account() }, owner.token);
    expect(
      (await fixture.request("/members", "GET", undefined, owner.token)).status,
    ).toBe(200);
    await fixture.pool.query(
      "DELETE FROM public.identity_roles WHERE identity_id=$1",
      [owner.identityId],
    );
    await rejected(
      await fixture.request(
        `/members/${target.member.id}`,
        "PATCH",
        {
          version: 0,
          title: "撤权后写入",
        },
        owner.token,
      ),
      403,
      11101,
    );
    expect(
      (
        await fixture.pool.query(
          "SELECT title,version FROM public.identities WHERE id=$1",
          [target.member.id],
        )
      ).rows[0],
    ).toEqual({ title: null, version: 0 });
    expect(
      (
        await fixture.pool.query(
          "SELECT count(*)::int total FROM public.audit_logs WHERE target_id=$1 AND action='member.update'",
          [target.member.id],
        )
      ).rows[0].total,
    ).toBe(0);
  });
});

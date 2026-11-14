import {
  apiResponseSchema,
  type CreateMember,
  createMemberResponseSchema,
  type Member,
  memberDetailSchema,
  memberListSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { v7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PasswordHasher } from "../../src/infra/crypto/password-hasher.js";
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
const newAccount = () => ({
  mode: "new" as const,
  username: `member-${v7()}`,
  realName: "成员验收",
});
async function create(
  token = fixture.admin.token,
  overrides: Partial<CreateMember> = {},
  query = "",
) {
  const response = await fixture.request(
    `/members${query}`,
    "POST",
    { account: newAccount(), ...overrides },
    token,
  );
  expect(response.status).toBe(201);
  return successResponseSchema(createMemberResponseSchema).parse(
    await response.json(),
  ).data;
}
async function list(token = fixture.admin.token, query = "") {
  const response = await fixture.request(
    `/members${query}`,
    "GET",
    undefined,
    token,
  );
  expect(response.status).toBe(200);
  return successResponseSchema(memberListSchema).parse(await response.json())
    .data;
}
async function detail(member: Member, token = fixture.admin.token, query = "") {
  const response = await fixture.request(
    `/members/${member.id}${query}`,
    "GET",
    undefined,
    token,
  );
  expect(response.status).toBe(200);
  return successResponseSchema(memberDetailSchema).parse(await response.json())
    .data;
}
async function error(response: Response, status: number, code: number) {
  expect(response.status).toBe(status);
  expect(apiResponseSchema.parse(await response.json()).code).toBe(code);
}
async function roleId(name: string, token: string) {
  const row = (await fixture.list(token)).find(
    (r) => r.name === name && r.kind === "preset",
  );
  if (!row) throw new Error("缺少测试角色");
  return row.id;
}
describe("组织成员与身份接口", () => {
  it("新建账号加密手机号、强制改密、幂等只写一次，列表详情不暴露凭证", async () => {
    const account = {
      ...newAccount(),
      phone: "13800001234",
      email: "member@example.test",
    };
    const key = v7();
    const response = await fixture.request(
      "/members",
      "POST",
      { account },
      undefined,
      key,
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const result = successResponseSchema(createMemberResponseSchema).parse(
      await response.json(),
    ).data;
    expect(result.initialPassword).toBe("123456");
    expect(result.member.phoneMasked).toBe("138****1234");
    const stored = await fixture.pool.query(
      "SELECT * FROM public.users WHERE id=$1",
      [result.member.userId],
    );
    expect(stored.rows[0]).toMatchObject({
      must_change_password: true,
      status: 1,
    });
    expect(stored.rows[0].phone).not.toContain(account.phone);
    expect(stored.rows[0].phone_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      await new PasswordHasher().verify(stored.rows[0].password_hash, "123456"),
    ).toBe(true);
    await error(
      await fixture.request("/members", "POST", { account }, undefined, key),
      409,
      90003,
    );
    const read = await detail(result.member);
    expect(JSON.stringify(read)).not.toMatch(/password|phone_hash|13800001234/);
    const audit = await fixture.pool.query(
      "SELECT changes FROM public.audit_logs WHERE target_id=$1",
      [result.member.id],
    );
    expect(audit.rowCount).toBe(1);
    expect(JSON.stringify(audit.rows)).not.toMatch(
      /123456|13800001234|password/i,
    );
    await error(
      await fixture.request("/members", "POST", { account }),
      409,
      12008,
    );
  });

  it("明确追加已有账号身份，不修改共享凭证，重复身份和未知账号不落库", async () => {
    const original = await create();
    const school = await fixture.seed("school", "school-admin");
    const before = (
      await fixture.pool.query("SELECT * FROM public.users WHERE id=$1", [
        original.member.userId,
      ])
    ).rows[0];
    const added = await create(school.token, {
      account: { mode: "existing", account: original.member.username },
    });
    expect(added).toMatchObject({
      accountCreated: false,
      initialPassword: null,
    });
    expect(added.member.userId).toBe(original.member.userId);
    expect(
      (
        await fixture.pool.query("SELECT * FROM public.users WHERE id=$1", [
          original.member.userId,
        ])
      ).rows[0],
    ).toEqual(before);
    expect((await detail(added.member, school.token)).otherIdentities).toEqual([
      { orgName: original.member.orgName, typeName: "公司", status: 1 },
    ]);
    await error(
      await fixture.request(
        "/members",
        "POST",
        {
          account: { mode: "existing", account: original.member.username },
        },
        school.token,
      ),
      409,
      12009,
    );
    await error(
      await fixture.request(
        "/members",
        "POST",
        {
          account: { mode: "existing", account: `missing-${v7()}` },
        },
        school.token,
      ),
      404,
      90004,
    );
    expect(
      (
        await fixture.pool.query(
          "SELECT * FROM public.identities WHERE user_id=$1",
          [original.member.userId],
        )
      ).rowCount,
    ).toBe(2);
  });

  it("学校管理员列表只含本校，其他组织身份或部门返回404，指定组织仅平台真超管可用", async () => {
    const one = await fixture.seed("school", "school-admin");
    const two = await fixture.seed("school", "school-admin");
    const target = await create(one.token);
    expect(
      (await list(two.token)).items.every((r) => r.orgId === two.orgId),
    ).toBe(true);
    for (const [path, method, body] of [
      [`/members/${target.member.id}`, "GET", undefined],
      [`/members/${target.member.id}`, "PATCH", { version: 0, title: "越权" }],
      [
        `/members/${target.member.id}/status`,
        "POST",
        { version: 0, status: 0 },
      ],
    ] as const)
      await error(
        await fixture.request(path, method, body, two.token),
        404,
        90004,
      );
    await error(
      await fixture.request(
        `/members?orgId=${one.orgId}`,
        "GET",
        undefined,
        two.token,
      ),
      403,
      11101,
    );
    expect(
      (await list(undefined, `?orgId=${one.orgId}`)).items.some(
        (r) => r.id === target.member.id,
      ),
    ).toBe(true);
    expect(
      (await detail(target.member, undefined, `?orgId=${one.orgId}`)).orgId,
    ).toBe(one.orgId);
    const foreign = await fixture.request(
      "/departments",
      "POST",
      { name: "外校部门" },
      two.token,
    );
    const dep = apiResponseSchema.parse(await foreign.json()).data as {
      id: string;
    };
    await error(
      await fixture.request(
        `/members/${target.member.id}`,
        "PATCH",
        {
          version: 0,
          departmentId: dep.id,
        },
        one.token,
      ),
      404,
      90004,
    );
    expect((await detail(target.member, one.token)).version).toBe(0);
  });

  it("部门筛选含下级、未分配、分页和关键字有效，修改版本并发仅成功一次", async () => {
    const school = await fixture.seed("school", "school-admin");
    const dep = apiResponseSchema.parse(
      await (
        await fixture.request(
          "/departments",
          "POST",
          { name: "父部门" },
          school.token,
        )
      ).json(),
    ).data as { id: string };
    const child = apiResponseSchema.parse(
      await (
        await fixture.request(
          "/departments",
          "POST",
          { name: "子部门", parentId: dep.id },
          school.token,
        )
      ).json(),
    ).data as { id: string };
    const target = await create(school.token, { departmentId: child.id });
    expect((await list(school.token, `?departmentId=${dep.id}`)).total).toBe(0);
    expect(
      (
        await list(
          school.token,
          `?departmentId=${dep.id}&includeDescendants=true`,
        )
      ).total,
    ).toBe(1);
    expect(
      (await list(school.token, "?departmentId=unassigned")).items.some(
        (r) => r.id === target.member.id,
      ),
    ).toBe(false);
    expect(
      await list(school.token, `?keyword=${target.member.username}&pageSize=1`),
    ).toMatchObject({ total: 1, pageSize: 1 });
    const responses = await Promise.all(
      ["职务一", "职务二"].map((title) =>
        fixture.request(
          `/members/${target.member.id}`,
          "PATCH",
          { version: 0, title, departmentId: null },
          school.token,
        ),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const saved = await detail(target.member, school.token);
    expect(saved).toMatchObject({
      version: 1,
      departmentId: null,
      departmentName: null,
    });
  });

  it("分配角色不能超出自身，每项数据范围独立校验，不能修改自己的角色", async () => {
    const restricted = await fixture.create("超级管理员");
    const input = roleInput(restricted);
    input.dataScope = "dept";
    input.grants = input.grants.map((g) => ({
      ...g,
      grant: {
        level: g.app === "org" && g.feature === "member" ? "manage" : "none",
      },
    }));
    expect(
      (await fixture.request(`/roles/${restricted.id}/grants`, "PUT", input))
        .status,
    ).toBe(200);
    const manager = await fixture.seed("company", null, fixture.admin.orgId);
    await fixture.pool.query(
      "INSERT INTO public.identity_roles(identity_id,role_id) VALUES($1,$2)",
      [manager.identityId, restricted.id],
    );
    const target = await create();
    const high = await roleId("超级管理员", fixture.admin.token);
    await error(
      await fixture.request(
        `/members/${target.member.id}`,
        "PATCH",
        {
          version: 0,
          roleIds: [high],
        },
        manager.token,
      ),
      403,
      11102,
    );
    await error(
      await fixture.request(
        `/members/${manager.identityId}`,
        "PATCH",
        {
          version: 0,
          roleIds: [],
        },
        manager.token,
      ),
      403,
      11103,
    );
    expect((await detail(target.member)).version).toBe(0);
    expect(
      (await detail(target.member, manager.token)).allowedActions,
    ).toContain("assignRoles");
    const higher = await create(undefined, { roleIds: [high] });
    expect((await detail(higher.member, manager.token)).allowedActions).toEqual(
      [],
    );
    await error(
      await fixture.request(
        `/members/${higher.member.id}/status`,
        "POST",
        {
          version: 0,
          status: 0,
        },
        manager.token,
      ),
      403,
      11102,
    );
  });

  it("最后管理员的角色不能被撤销，停用也会原子拒绝，并发两人仅允许停用一人", async () => {
    const school = await fixture.seed("school", "school-admin");
    const query = `?orgId=${school.orgId}`;
    await error(
      await fixture.request(`/members/${school.identityId}${query}`, "PATCH", {
        version: 0,
        roleIds: [],
      }),
      409,
      11104,
    );
    await error(
      await fixture.request(
        `/members/${school.identityId}/status${query}`,
        "POST",
        {
          version: 0,
          status: 0,
        },
      ),
      409,
      11104,
    );
    expect(
      (
        await fixture.pool.query(
          "SELECT status,version FROM public.identities WHERE id=$1",
          [school.identityId],
        )
      ).rows[0],
    ).toEqual({ status: 1, version: 0 });
    expect(
      (
        await fixture.pool.query(
          "SELECT role_id FROM public.identity_roles WHERE identity_id=$1",
          [school.identityId],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await fixture.pool.query(
          "SELECT * FROM public.audit_logs WHERE org_id=$1 AND action IN ('member.update','member.status')",
          [school.orgId],
        )
      ).rowCount,
    ).toBe(0);
    const backup = await fixture.seed("school", "school-admin", school.orgId);
    const responses = await Promise.all(
      [school, backup].map((person) =>
        fixture.request(
          `/members/${person.identityId}/status${query}`,
          "POST",
          { version: 0, status: 0 },
        ),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (
        await fixture.pool.query(
          "SELECT * FROM public.identities WHERE org_id=$1 AND status=1",
          [school.orgId],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await fixture.pool.query(
          "SELECT * FROM public.audit_logs WHERE org_id=$1 AND action='member.status'",
          [school.orgId],
        )
      ).rowCount,
    ).toBe(1);
  });

  it("无成员权限、只读和账号级令牌不能写；角色与身份类型不符时拒绝", async () => {
    const empty = await fixture.seed("company", null);
    const readonly = await fixture.seed("company", "company-readonly-auditor");
    const target = await create();
    await error(
      await fixture.request("/members", "GET", undefined, empty.token),
      403,
      11101,
    );
    for (const token of [empty.token, readonly.token]) {
      await error(
        await fixture.request(
          "/members",
          "POST",
          { account: newAccount() },
          token,
        ),
        403,
        11101,
      );
      await error(
        await fixture.request(
          `/members/${target.member.id}`,
          "PATCH",
          { version: 0, title: "禁止写入" },
          token,
        ),
        403,
        11101,
      );
    }
    expect(
      (await fixture.request("/members", "GET", undefined, empty.account))
        .status,
    ).toBe(401);
    const school = await fixture.seed("school", "school-admin");
    await error(
      await fixture.request(
        "/members",
        "POST",
        {
          account: newAccount(),
          roleIds: [await roleId("超级管理员", fixture.admin.token)],
        },
        school.token,
      ),
      404,
      90004,
    );
  });
});

import {
  apiResponseSchema,
  memberOptionsSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  roleInput,
  roleManagementFixture,
} from "../helpers/role-management.js";

let fixture: Awaited<ReturnType<typeof roleManagementFixture>>;
beforeAll(async () => {
  fixture = await roleManagementFixture();
}, 120000);
afterAll(async () => {
  await fixture?.stop();
}, 30000);
async function options(token = fixture.admin.token, query = "") {
  const response = await fixture.request(
    `/members/options${query}`,
    "GET",
    undefined,
    token,
  );
  expect(response.status).toBe(200);
  return successResponseSchema(memberOptionsSchema).parse(await response.json())
    .data;
}
describe("成员表单选项", () => {
  it("空组织的新建能力独立返回，只读没有新增能力或角色选项，部门不跨组织", async () => {
    const one = await fixture.seed("school", "school-admin");
    const two = await fixture.seed("school", "school-admin");
    await fixture.request(
      "/departments",
      "POST",
      { name: "仅本校部门" },
      one.token,
    );
    expect(await options(two.token)).toMatchObject({
      allowedActions: ["create"],
      departments: [],
    });
    expect((await options(one.token)).departments.map((r) => r.name)).toEqual([
      "仅本校部门",
    ]);
    const readonly = await fixture.seed("company", "company-readonly-auditor");
    expect(await options(readonly.token)).toMatchObject({
      allowedActions: [],
      roles: [],
    });
    const denied = await fixture.request(
      `/members/options?orgId=${one.orgId}`,
      "GET",
      undefined,
      two.token,
    );
    expect(denied.status).toBe(403);
    expect(apiResponseSchema.parse(await denied.json()).code).toBe(11101);
    expect(
      (await options(undefined, `?orgId=${one.orgId}`)).departments,
    ).toHaveLength(1);
  });
  it("仅有成员管理也可加载选项，超出自身的角色和已停用角色不会返回", async () => {
    const custom = await fixture.create("超级管理员");
    const input = roleInput(custom);
    input.grants = input.grants.map((g) => ({
      ...g,
      grant: {
        level: g.app === "org" && g.feature === "member" ? "manage" : "none",
      },
    }));
    expect(
      (await fixture.request(`/roles/${custom.id}/grants`, "PUT", input))
        .status,
    ).toBe(200);
    const manager = await fixture.seed("company", null, fixture.admin.orgId);
    await fixture.pool.query(
      "INSERT INTO public.identity_roles(identity_id,role_id) VALUES($1,$2)",
      [manager.identityId, custom.id],
    );
    expect(
      (await fixture.request("/roles", "GET", undefined, manager.token)).status,
    ).toBe(403);
    expect(
      (
        await fixture.request(
          "/departments/tree",
          "GET",
          undefined,
          manager.token,
        )
      ).status,
    ).toBe(403);
    const data = await options(manager.token);
    expect(data.allowedActions).toEqual(["create"]);
    expect(data.roles.map((r) => r.id)).toContain(custom.id);
    expect(data.roles.some((r) => r.name === "超级管理员")).toBe(false);
    await fixture.pool.query("UPDATE public.roles SET status=0 WHERE id=$1", [
      custom.id,
    ]);
    expect((await options()).roles.some((r) => r.id === custom.id)).toBe(false);
  });
  it("无成员查询权限不能通过选项接口读取任何组织信息", async () => {
    const empty = await fixture.seed("company", null);
    const response = await fixture.request(
      "/members/options",
      "GET",
      undefined,
      empty.token,
    );
    expect(response.status).toBe(403);
    expect(apiResponseSchema.parse(await response.json()).code).toBe(11101);
  });
});

import {
  apiResponseSchema,
  presetRoleListSchema,
  roleDetailSchema,
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
  fixture = await roleManagementFixture();
}, 120000);
afterAll(async () => {
  await fixture?.stop();
}, 30000);
const parsed = async (r: Response) =>
  successResponseSchema(roleDetailSchema).parse(await r.json()).data;

describe("本组织自定义角色接口", () => {
  it("内置只读、新建编码自动生成、不复制授权行，重复提交仅创建一次并写一次审计", async () => {
    const { list, request, pool, admin } = fixture;
    const presets = await list();
    expect(
      presets.every((r) => r.kind === "preset" && !r.allowedActions.length),
    ).toBe(true);
    expect(presets.every((r) => r.identityType === "company")).toBe(true);
    const base = presets.find((r) => r.name === "生产");
    if (!base) throw new Error("缺少生产角色");
    const body = { name: "生产协助", baseRoleId: base.id, dataScope: "dept" };
    const key = v7();
    const response = await request("/roles", "POST", body, admin.token, key);
    expect(response.status).toBe(201);
    const row = await parsed(response);
    expect(row).toMatchObject({
      name: "生产协助",
      kind: "custom",
      version: 0,
      dataScope: "dept",
      baseRoleId: base.id,
      baseRoleName: "生产",
      allowedActions: ["update", "reset"],
    });
    expect(row.grants.every((g) => !g.modified)).toBe(true);
    const stored = await pool.query(
      "SELECT code,org_id,identity_type FROM public.roles WHERE id=$1",
      [row.id],
    );
    expect(stored.rows[0].code).toBe(`custom-${row.id}`);
    expect(stored.rows[0].org_id).toBe(admin.orgId);
    expect(stored.rows[0].identity_type).toBe("company");
    expect(
      (
        await pool.query("SELECT * FROM public.role_grants WHERE role_id=$1", [
          row.id,
        ])
      ).rowCount,
    ).toBe(0);
    const repeat = await request("/roles", "POST", body, admin.token, key);
    expect(repeat.status).toBe(409);
    const replay = apiResponseSchema.parse(await repeat.json());
    expect(replay.code).toBe(90003);
    expect(roleDetailSchema.parse(replay.data)).toEqual(row);
    expect(
      (
        await pool.query("SELECT * FROM public.audit_logs WHERE target_id=$1", [
          row.id,
        ])
      ).rowCount,
    ).toBe(1);
  });

  it("整体提交只保存差异，更新并发只有一次成功；恢复清除差异并保留资源版本", async () => {
    const { create, request, pool, detail } = fixture;
    const row = await create();
    const body = roleInput(row);
    body.dataScope = "personal";
    body.grants = body.grants.map((g) =>
      g.app === "school" && g.feature === "student"
        ? { ...g, grant: { level: "view" } }
        : g,
    );
    const responses = await Promise.all([
      request(`/roles/${row.id}/grants`, "PUT", body),
      request(`/roles/${row.id}/grants`, "PUT", body),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const conflict = responses.find((r) => r.status === 409);
    expect(apiResponseSchema.parse(await conflict?.json()).code).toBe(90002);
    const saved = await detail(row.id);
    expect(saved.version).toBe(1);
    expect(saved.grants.filter((g) => g.modified)).toHaveLength(1);
    expect(
      (
        await pool.query("SELECT * FROM public.role_grants WHERE role_id=$1", [
          row.id,
        ])
      ).rowCount,
    ).toBe(1);
    const resetKey = v7(),
      resetBody = { version: saved.version };
    const response = await request(
      `/roles/${row.id}/reset`,
      "POST",
      resetBody,
      undefined,
      resetKey,
    );
    expect(response.status).toBe(201);
    const reset = await parsed(response);
    expect(reset).toMatchObject({
      version: 2,
      modified: false,
      dataScope: row.dataScope,
    });
    expect(reset.grants.every((g) => !g.modified)).toBe(true);
    expect(
      (
        await pool.query("SELECT * FROM public.role_grants WHERE role_id=$1", [
          row.id,
        ])
      ).rowCount,
    ).toBe(0);
    const replay = await request(
      `/roles/${row.id}/reset`,
      "POST",
      resetBody,
      undefined,
      resetKey,
    );
    expect(replay.status).toBe(409);
    expect(apiResponseSchema.parse(await replay.json()).code).toBe(90003);
    expect((await detail(row.id)).version).toBe(2);
    const audit = await pool.query(
      "SELECT action FROM public.audit_logs WHERE target_id=$1 ORDER BY created_at",
      [row.id],
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      "role.create",
      "role.update",
      "role.reset",
    ]);
  });

  it("跨组织自定义角色及不适用的基础角色返回404，不允许自定义角色再次作为基础", async () => {
    const { create, seed, request, list } = fixture;
    const row = await create();
    const other = await seed("company", "company-super-admin");
    expect((await list(other.token)).some((r) => r.id === row.id)).toBe(false);
    for (const [path, method, body] of [
      [`/roles/${row.id}`, "GET", undefined],
      [`/roles/${row.id}/grants`, "PUT", roleInput(row)],
      [`/roles/${row.id}/reset`, "POST", { version: row.version }],
    ] as const)
      expect((await request(path, method, body, other.token)).status).toBe(404);
    expect(
      (
        await request("/roles", "POST", {
          name: "不支持嵌套",
          baseRoleId: row.id,
          dataScope: "personal",
        })
      ).status,
    ).toBe(404);
    const school = await seed("school", "school-admin");
    const schoolRoles = await list(school.token);
    expect(new Set(schoolRoles.map((r) => r.identityType))).toEqual(
      new Set(["school", "teacher"]),
    );
    const base = schoolRoles.find((r) => r.identityType === "teacher");
    if (!base) throw new Error("缺少教师角色");
    expect(
      (
        await request("/roles", "POST", {
          name: "跨类型",
          baseRoleId: base.id,
          dataScope: "personal",
        })
      ).status,
    ).toBe(404);
    expect(await list(fixture.admin.token, "?identityType=teacher")).toEqual(
      [],
    );
    expect((await request(`/roles?orgId=${other.orgId}`)).status).toBe(400);
  });

  it("缺权限返回403、账号令牌返回401，不能通过组织接口修改内置角色或自身角色", async () => {
    const { create, seed, request, list, pool } = fixture;
    const readonly = await seed("company", "company-readonly-auditor");
    const empty = await seed("company", null);
    const row = await create("超级管理员");
    const own = await seed("company", null, fixture.admin.orgId);
    await pool.query(
      "INSERT INTO public.identity_roles(identity_id,role_id) VALUES($1,$2)",
      [own.identityId, row.id],
    );
    for (const token of [readonly.token, own.token]) {
      const response = await request(
        `/roles/${row.id}`,
        "GET",
        undefined,
        token,
      );
      // 只读身份属于另一个组织，资源不可见；拥有该角色的身份可读但不可修改自身。
      expect(response.status).toBe(token === own.token ? 200 : 404);
      if (response.status === 200)
        expect((await parsed(response)).allowedActions).toEqual([]);
    }
    for (const [path, method, body] of [
      ["/roles", "GET", undefined],
      [`/roles/${row.id}`, "GET", undefined],
      [
        "/roles",
        "POST",
        { name: "测试", baseRoleId: row.baseRoleId, dataScope: "personal" },
      ],
      [`/roles/${row.id}/grants`, "PUT", roleInput(row)],
      [`/roles/${row.id}/reset`, "POST", { version: 0 }],
    ] as const) {
      expect((await request(path, method, body, empty.token)).status).toBe(403);
      expect((await request(path, method, body, empty.account)).status).toBe(
        401,
      );
      if (method !== "GET")
        expect((await request(path, method, body, readonly.token)).status).toBe(
          403,
        );
    }
    for (const [path, body] of [
      [`/roles/${row.id}/grants`, roleInput(row)],
      [`/roles/${row.id}/reset`, { version: 0 }],
    ] as const) {
      const response = await request(
        path,
        path.endsWith("reset") ? "POST" : "PUT",
        body,
        own.token,
      );
      expect(response.status).toBe(403);
      expect(apiResponseSchema.parse(await response.json()).code).toBe(11103);
    }
    const preset = (await list()).find((r) => r.kind === "preset");
    if (!preset) throw new Error("缺少内置角色");
    const detail = await fixture.detail(preset.id);
    const response = await request(
      `/roles/${preset.id}/grants`,
      "PUT",
      roleInput(detail),
    );
    expect(response.status).toBe(403);
    expect(apiResponseSchema.parse(await response.json()).code).toBe(11105);
  });

  it("模板变更后未调整功能跟随、已调整功能保留，同一角色令牌真实业务权限立即改变", async () => {
    const { create, request, detail, seed, pool } = fixture;
    const custom = await create();
    const input = roleInput(custom);
    input.grants = input.grants.map((g) =>
      g.app === "school" && g.feature === "student"
        ? { ...g, grant: { level: "view" } }
        : g,
    );
    expect(
      (await request(`/roles/${custom.id}/grants`, "PUT", input)).status,
    ).toBe(200);
    const user = await seed("company", null, fixture.admin.orgId);
    await pool.query(
      "INSERT INTO public.identity_roles(identity_id,role_id) VALUES($1,$2)",
      [user.identityId, custom.id],
    );
    expect((await request("/orgs", "GET", undefined, user.token)).status).toBe(
      403,
    );
    const templates = successResponseSchema(presetRoleListSchema).parse(
      await (await request("/preset-roles")).json(),
    ).data;
    const base = templates.find((r) => r.id === custom.baseRoleId);
    if (!base) throw new Error("缺少生产模板");
    expect(
      (
        await request(`/preset-roles/${base.id}`, "PUT", {
          version: base.version,
          dataScope: base.dataScope,
          remark: base.remark,
          grants: base.grants.map(({ app, feature, grant }) => ({
            app,
            feature,
            grant:
              app === "platform" && feature === "org"
                ? { level: "view" }
                : app === "school" && feature === "student"
                  ? { level: "edit" }
                  : grant,
          })),
        })
      ).status,
    ).toBe(200);
    const changed = await detail(custom.id);
    expect(
      changed.grants.find((g) => g.app === "platform" && g.feature === "org"),
    ).toMatchObject({ grant: { level: "view" }, modified: false });
    expect(
      changed.grants.find((g) => g.app === "school" && g.feature === "student"),
    ).toMatchObject({
      grant: { level: "view" },
      baseGrant: { level: "edit" },
      modified: true,
    });
    expect((await request("/orgs", "GET", undefined, user.token)).status).toBe(
      200,
    );
    expect(
      (
        await request(
          `/orgs/${fixture.admin.orgId}`,
          "PATCH",
          {
            name: "禁止修改",
            regionCode: null,
            version: 0,
          },
          user.token,
        )
      ).status,
    ).toBe(403);
    const response = await request(`/preset-roles/${base.id}/reset`, "POST", {
      version: base.version + 1,
    });
    expect(response.status).toBe(201);
    expect((await request("/orgs", "GET", undefined, user.token)).status).toBe(
      403,
    );
  });

  it("低权限管理者不能创建或改动高于自身的角色，非法档位不写库", async () => {
    const { create, request, seed, pool, detail } = fixture;
    const limited = await create("超级管理员");
    const input = roleInput(limited);
    input.dataScope = "dept";
    input.grants = input.grants.map((g) => ({
      ...g,
      grant: {
        level: g.app === "org" && g.feature === "role" ? "manage" : "none",
      },
    }));
    expect(
      (await request(`/roles/${limited.id}/grants`, "PUT", input)).status,
    ).toBe(200);
    const manager = await seed("company", null, fixture.admin.orgId);
    await pool.query(
      "INSERT INTO public.identity_roles(identity_id,role_id) VALUES($1,$2)",
      [manager.identityId, limited.id],
    );
    const target = await create();
    const creation = await request(
      "/roles",
      "POST",
      {
        name: "越权继承",
        baseRoleId: target.baseRoleId,
        dataScope: "personal",
      },
      manager.token,
    );
    expect(creation.status).toBe(403);
    expect(apiResponseSchema.parse(await creation.json()).code).toBe(11102);
    const before = await detail(target.id);
    const response = await request(
      `/roles/${target.id}/grants`,
      "PUT",
      {
        ...roleInput(target),
        dataScope: "personal",
      },
      manager.token,
    );
    expect(response.status).toBe(403);
    expect(apiResponseSchema.parse(await response.json()).code).toBe(11102);
    for (const grants of [
      [],
      [...roleInput(target).grants, roleInput(target).grants[0]],
    ])
      expect(
        (
          await request(`/roles/${target.id}/grants`, "PUT", {
            ...roleInput(target),
            grants,
          })
        ).status,
      ).toBe(400);
    expect((await detail(target.id)).version).toBe(before.version);
    await pool.query("UPDATE public.roles SET deleted_at=now() WHERE id=$1", [
      target.id,
    ]);
    expect((await request(`/roles/${target.id}`)).status).toBe(404);
    expect((await fixture.list()).some((r) => r.id === target.id)).toBe(false);
  });
});

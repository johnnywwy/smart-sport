import {
  apiResponseSchema,
  presetRoleListSchema,
  type SavePresetRole,
  successResponseSchema,
} from "@smart-sport/contracts";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IdentityContextService } from "../../src/modules/platform/identity-context/index.js";
import { RoleManagementService } from "../../src/modules/platform/role-management/index.js";
import { AdministratorService } from "../../src/modules/platform/roles/index.js";
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

async function template(type: string, name: string, target = fixture) {
  const response = await target.request("/preset-roles");
  expect(response.status).toBe(200);
  const rows = successResponseSchema(presetRoleListSchema).parse(
    await response.json(),
  ).data;
  const row = rows.find((r) => r.identityType === type && r.name === name);
  if (!row) throw new Error("缺少测试模板");
  return {
    id: row.id,
    input: {
      version: row.version,
      dataScope: row.dataScope,
      remark: row.remark,
      grants: row.grants.map(({ app, feature, grant }) => ({
        app,
        feature,
        grant,
      })),
    } satisfies SavePresetRole,
  };
}

describe("分级管理与管理员保留", () => {
  it("低权限管理者不能把可管理角色升权或恢复成高权限基础角色", async () => {
    const limited = await fixture.create("超级管理员");
    const limitedInput = roleInput(limited);
    limitedInput.dataScope = "dept";
    limitedInput.grants = limitedInput.grants.map((g) => ({
      ...g,
      grant: {
        level: g.app === "org" && g.feature === "role" ? "manage" : "none",
      },
    }));
    expect(
      (
        await fixture.request(
          `/roles/${limited.id}/grants`,
          "PUT",
          limitedInput,
        )
      ).status,
    ).toBe(200);
    const manager = await fixture.seed("company", null, fixture.admin.orgId);
    await fixture.pool.query(
      "INSERT INTO public.identity_roles(identity_id,role_id) VALUES($1,$2)",
      [manager.identityId, limited.id],
    );
    const target = await fixture.create("超级管理员");
    expect(
      (
        await fixture.request(`/roles/${target.id}/grants`, "PUT", {
          ...limitedInput,
          version: target.version,
        })
      ).status,
    ).toBe(200);
    const before = await fixture.detail(target.id);
    expect(
      (await fixture.detail(target.id, manager.token)).allowedActions,
    ).toEqual(["update"]);
    const higher = roleInput(before);
    higher.grants = higher.grants.map((g) =>
      g.app === "org" && g.feature === "member"
        ? { ...g, grant: { level: "view" } }
        : g,
    );
    for (const [path, method, body] of [
      [`/roles/${target.id}/grants`, "PUT", higher],
      [`/roles/${target.id}/reset`, "POST", { version: before.version }],
    ] as const) {
      const response = await fixture.request(path, method, body, manager.token);
      expect(response.status).toBe(403);
      expect(apiResponseSchema.parse(await response.json()).code).toBe(11102);
    }
    expect(await fixture.detail(target.id)).toEqual(before);
    expect(
      (
        await fixture.pool.query(
          "SELECT count(*) FROM public.audit_logs WHERE target_id=$1",
          [target.id],
        )
      ).rows[0].count,
    ).toBe("2");
  });

  it("模板不能移除最后管理员的成员管理能力，版本、覆盖和审计均不变化", async () => {
    const school = await fixture.seed("school", "school-admin");
    const row = await template("school", "学校管理员");
    const before = await fixture.pool.query(
      "SELECT count(*) FROM public.audit_logs WHERE target_id=$1",
      [row.id],
    );
    const response = await fixture.request(`/preset-roles/${row.id}`, "PUT", {
      ...row.input,
      grants: row.input.grants.map((g) =>
        g.app === "org" && g.feature === "member"
          ? { ...g, grant: { level: "edit" } }
          : g,
      ),
    });
    expect(response.status).toBe(409);
    expect(apiResponseSchema.parse(await response.json()).code).toBe(11104);
    expect((await template("school", "学校管理员")).input).toEqual(row.input);
    expect(
      await fixture.pool.query(
        "SELECT * FROM public.preset_role_overrides WHERE role_id=$1",
        [row.id],
      ),
    ).toMatchObject({ rowCount: 0 });
    expect(
      (
        await fixture.pool.query(
          "SELECT count(*) FROM public.audit_logs WHERE target_id=$1",
          [row.id],
        )
      ).rows,
    ).toEqual(before.rows);
    expect((await fixture.list(school.token)).length).toBeGreaterThan(0);
  });

  it("自定义角色的最终差异可保留管理员，另一个组织的管理员不能代替本组织", async () => {
    const organization = await fixture.seed("agent", "agent-admin");
    const another = await fixture.seed("agent", "agent-admin");
    const addBackup = async (org: typeof organization) => {
      const backup = await fixture.create("代理商运营", org.token);
      const input = roleInput(backup);
      input.grants = input.grants.map((g) =>
        g.app === "org" && ["member", "role"].includes(g.feature)
          ? { ...g, grant: { level: "manage" } }
          : g,
      );
      expect(
        (
          await fixture.request(
            `/roles/${backup.id}/grants`,
            "PUT",
            input,
            org.token,
          )
        ).status,
      ).toBe(200);
      const alternate = await fixture.seed("agent", null, org.orgId);
      await fixture.pool.query(
        "INSERT INTO public.identity_roles(identity_id,role_id) VALUES($1,$2)",
        [alternate.identityId, backup.id],
      );
    };
    await addBackup(organization);
    let row = await template("agent", "代理商管理员");
    const downgraded = () => ({
      ...row.input,
      grants: row.input.grants.map((g) =>
        g.app === "org" && g.feature === "member"
          ? { ...g, grant: { level: "view" as const } }
          : g,
      ),
    });
    expect(
      apiResponseSchema.parse(
        await (
          await fixture.request(`/preset-roles/${row.id}`, "PUT", downgraded())
        ).json(),
      ).code,
    ).toBe(11104);
    await addBackup(another);
    expect(
      (await fixture.request(`/preset-roles/${row.id}`, "PUT", downgraded()))
        .status,
    ).toBe(200);
    row = await template("agent", "代理商管理员");
    expect(
      (
        await fixture.request(`/preset-roles/${row.id}/reset`, "POST", {
          version: row.input.version,
        })
      ).status,
    ).toBe(201);
  });

  it("停用、删除的身份或停用账号不能充当后备管理员", async () => {
    const service = fixture.app.get(AdministratorService);
    const org = await fixture.seed("bureau", "bureau-admin");
    const disabled = await fixture.seed("bureau", "bureau-admin", org.orgId);
    const deleted = await fixture.seed("bureau", "bureau-admin", org.orgId);
    const stoppedUser = await fixture.seed("bureau", "bureau-admin", org.orgId);
    await fixture.pool.query(
      "UPDATE public.identities SET status=0 WHERE id=$1",
      [disabled.identityId],
    );
    await fixture.pool.query(
      "UPDATE public.identities SET deleted_at=now() WHERE id=$1",
      [deleted.identityId],
    );
    await fixture.pool.query(
      "UPDATE public.users SET status=0 WHERE id=(SELECT user_id FROM public.identities WHERE id=$1)",
      [stoppedUser.identityId],
    );
    const db = drizzle(fixture.pool);
    await expect(
      db.transaction(async (tx) => {
        const protectedOrgs = await service.beforeMemberChange(tx, [org.orgId]);
        expect(protectedOrgs).toEqual([org.orgId]);
        await tx.execute(
          sql`UPDATE public.identities SET status=0 WHERE id=${org.identityId}`,
        );
        await service.assertRetained(tx, protectedOrgs);
      }),
    ).rejects.toMatchObject({ code: 11104 });
    expect(
      (
        await fixture.pool.query(
          "SELECT status FROM public.identities WHERE id=$1",
          [org.identityId],
        )
      ).rows[0].status,
    ).toBe(1);
  });

  it("并发停用两名管理员只允许一名成功，拒绝事务回滚", async () => {
    const one = await fixture.seed("agent", "agent-admin");
    const two = await fixture.seed("agent", "agent-admin", one.orgId);
    const guard = fixture.app.get(AdministratorService);
    const db = drizzle(fixture.pool);
    const results = await Promise.allSettled(
      [one, two].map((member) =>
        db.transaction(async (tx) => {
          const protectedOrgs = await guard.beforeMemberChange(tx, [one.orgId]);
          await tx.execute(
            sql`UPDATE public.identities SET status=0 WHERE id=${member.identityId}`,
          );
          await guard.assertRetained(tx, protectedOrgs);
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({
      code: 11104,
    });
    expect(
      (
        await fixture.pool.query(
          "SELECT id FROM public.identities WHERE org_id=$1 AND status=1",
          [one.orgId],
        )
      ).rowCount,
    ).toBe(1);
  });

  it("不同身份不能拼凑管理员能力，停用角色和外组织绑定均不计入", async () => {
    const owner = await fixture.seed("bureau", "bureau-admin");
    for (const feature of ["member", "role"]) {
      const custom = await fixture.create("业务科员", owner.token);
      const input = roleInput(custom);
      input.grants = input.grants.map((g) =>
        g.app === "org" && g.feature === feature
          ? { ...g, grant: { level: "manage" } }
          : g,
      );
      expect(
        (
          await fixture.request(
            `/roles/${custom.id}/grants`,
            "PUT",
            input,
            owner.token,
          )
        ).status,
      ).toBe(200);
      const person = await fixture.seed("bureau", null, owner.orgId);
      await fixture.pool.query(
        "INSERT INTO public.identity_roles(identity_id,role_id) VALUES($1,$2)",
        [person.identityId, custom.id],
      );
    }
    const disabled = await fixture.create("局管理员", owner.token);
    await fixture.pool.query("UPDATE public.roles SET status=0 WHERE id=$1", [
      disabled.id,
    ]);
    const foreignOwner = await fixture.seed("bureau", "bureau-admin");
    const foreign = await fixture.create("局管理员", foreignOwner.token);
    const invalid = await fixture.seed("bureau", null, owner.orgId);
    await fixture.pool.query(
      "INSERT INTO public.identity_roles(identity_id,role_id) VALUES($1,$2),($1,$3)",
      [invalid.identityId, disabled.id, foreign.id],
    );
    const guard = fixture.app.get(AdministratorService);
    await expect(
      drizzle(fixture.pool).transaction(async (tx) => {
        const protectedOrgs = await guard.beforeMemberChange(tx, [owner.orgId]);
        await tx.execute(
          sql`DELETE FROM public.identity_roles WHERE identity_id=${owner.identityId}`,
        );
        await guard.assertRetained(tx, protectedOrgs);
      }),
    ).rejects.toMatchObject({ code: 11104 });
    expect(
      (
        await fixture.pool.query(
          "SELECT role_id FROM public.identity_roles WHERE identity_id=$1",
          [owner.identityId],
        )
      ).rowCount,
    ).toBe(1);
  });

  it("恢复默认同样不能撤掉模板新增的最后管理员能力", async () => {
    let row = await template("bureau", "业务科员");
    expect(
      (
        await fixture.request(`/preset-roles/${row.id}`, "PUT", {
          ...row.input,
          grants: row.input.grants.map((g) =>
            g.app === "org" && ["member", "role"].includes(g.feature)
              ? { ...g, grant: { level: "manage" } }
              : g,
          ),
        })
      ).status,
    ).toBe(200);
    const owner = await fixture.seed("bureau", "bureau-officer");
    row = await template("bureau", "业务科员");
    const response = await fixture.request(
      `/preset-roles/${row.id}/reset`,
      "POST",
      { version: row.input.version },
    );
    expect(response.status).toBe(409);
    expect(apiResponseSchema.parse(await response.json()).code).toBe(11104);
    expect((await template("bureau", "业务科员")).input).toEqual(row.input);
    await fixture.seed("bureau", "bureau-admin", owner.orgId);
    expect(
      (
        await fixture.request(`/preset-roles/${row.id}/reset`, "POST", {
          version: row.input.version,
        })
      ).status,
    ).toBe(201);
  });

  it("取得事务锁后重读自身角色绑定与权限，不能沿用 Guard 先前的授权", async () => {
    const owner = await fixture.seed("company", "company-super-admin");
    const context = fixture.app.get(IdentityContextService);
    const service = fixture.app.get(RoleManagementService);
    const oldActor = await context.load(owner.identityId);
    const custom = await fixture.create("生产", owner.token);
    if (!custom.baseRoleId) throw new Error("测试角色缺少基础角色");
    const metadata = {
      traceId: owner.identityId,
      ip: "127.0.0.1",
      userAgent: "test",
    };
    await fixture.pool.query(
      "INSERT INTO public.identity_roles(identity_id,role_id) VALUES($1,$2)",
      [owner.identityId, custom.id],
    );
    await expect(
      service.save(custom.id, roleInput(custom), oldActor, metadata),
    ).rejects.toMatchObject({ code: 11103 });
    await fixture.pool.query(
      "DELETE FROM public.identity_roles WHERE identity_id=$1",
      [owner.identityId],
    );
    await expect(
      service.create(
        {
          name: "撤权后不得创建",
          baseRoleId: custom.baseRoleId,
          dataScope: "personal",
        },
        oldActor,
        metadata,
      ),
    ).rejects.toMatchObject({ code: 11101 });
    expect(
      (
        await fixture.pool.query(
          "SELECT version FROM public.roles WHERE id=$1",
          [custom.id],
        )
      ).rows[0].version,
    ).toBe(0);
    expect(
      (
        await fixture.pool.query(
          "SELECT count(*) FROM public.roles WHERE org_id=$1",
          [owner.orgId],
        )
      ).rows[0].count,
    ).toBe("1");
    expect(
      (
        await fixture.pool.query(
          "SELECT count(*) FROM public.audit_logs WHERE target_id=$1",
          [custom.id],
        )
      ).rows[0].count,
    ).toBe("1");
  });

  it("两个模板并发降权时，一个成功、另一个返回11104，组织仍有管理员", async () => {
    const isolated = await roleManagementFixture();
    try {
      let officer = await template("bureau", "业务科员", isolated);
      expect(
        (
          await isolated.request(`/preset-roles/${officer.id}`, "PUT", {
            ...officer.input,
            grants: officer.input.grants.map((g) =>
              g.app === "org" && ["member", "role"].includes(g.feature)
                ? { ...g, grant: { level: "manage" } }
                : g,
            ),
          })
        ).status,
      ).toBe(200);
      const owner = await isolated.seed("bureau", "bureau-admin");
      await isolated.seed("bureau", "bureau-officer", owner.orgId);
      officer = await template("bureau", "业务科员", isolated);
      const admin = await template("bureau", "局管理员", isolated);
      const responses = await Promise.all(
        [admin, officer].map((row) =>
          isolated.request(`/preset-roles/${row.id}`, "PUT", {
            ...row.input,
            grants: row.input.grants.map((g) =>
              g.app === "org" && g.feature === "member"
                ? { ...g, grant: { level: "view" } }
                : g,
            ),
          }),
        ),
      );
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      const rejected = responses.find((r) => r.status === 409);
      expect(apiResponseSchema.parse(await rejected?.json()).code).toBe(11104);
      const final = await Promise.all([
        template("bureau", "局管理员", isolated),
        template("bureau", "业务科员", isolated),
      ]);
      expect(
        final.filter((row) =>
          row.input.grants.some(
            (g) =>
              g.app === "org" &&
              g.feature === "member" &&
              g.grant.level === "manage",
          ),
        ),
      ).toHaveLength(1);
      expect(
        (
          await isolated.pool.query(
            "SELECT count(*) FROM public.audit_logs WHERE action='preset-role.update'",
          )
        ).rows[0].count,
      ).toBe("2");
    } finally {
      await isolated.stop();
    }
  }, 120000);
});

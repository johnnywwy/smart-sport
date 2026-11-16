import {
  schoolProfileSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { migratePublic } from "../../src/database/migrate.js";
import { SchoolProfilesRepository } from "../../src/modules/platform/school-profiles/index.js";
import { schoolProfileFixture } from "../helpers/school-profiles.js";

let f: Awaited<ReturnType<typeof schoolProfileFixture>>;
beforeAll(async () => {
  f = await schoolProfileFixture();
}, 120000);
afterAll(async () => {
  await f?.stop();
}, 30000);
const path = (id: string) => `/schools/${id}/profile`;
const read = async (id: string, token = f.admin.token) => {
  const response = await f.request(path(id), "GET", undefined, token);
  expect(response.status).toBe(200);
  return successResponseSchema(schoolProfileSchema).parse(await response.json())
    .data;
};

it("迁移可重跑；档案保存于public，标识码保留前导零、手机号加密并只返回脱敏值", async () => {
  expect(await migratePublic(f.pool)).toEqual([]);
  const p = await f.profile(),
    result = await read(p.id);
  expect(result).toMatchObject({
    schoolId: p.id,
    schoolCode: p.input.schoolCode,
    stages: [1, 2],
    stageYears: { "1": 6, "2": 3 },
    contactPhone: "138****5678",
    allowedActions: ["update"],
    version: 0,
  });
  expect(result.schoolCode).toHaveLength(10);
  const row = (await f.rows(p.id))[0];
  expect(row.contact_phone).toMatch(/^v1:/);
  expect(row.contact_phone).not.toContain(p.input.contactPhone);
  expect(row.contact_phone_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(result).not.toHaveProperty("contactPhoneHash");
  expect(
    (
      await f.pool.query(
        "SELECT action FROM public.audit_logs WHERE target_id=$1",
        [p.id],
      )
    ).rows,
  ).toContainEqual({ action: "school.profile.view" });
});

it("缺功能403、账号令牌401；不可见、无档案、停用、删除学校均404，GET不创建档案", async () => {
  const p = await f.profile(),
    empty = await f.school();
  const actor = await f.seed("company", null, f.admin.orgId);
  expect(
    (await f.request(path(p.id), "GET", undefined, actor.token)).status,
  ).toBe(403);
  expect(
    (await f.request(path(p.id), "GET", undefined, f.admin.account)).status,
  ).toBe(401);
  for (const id of [empty, v7(), f.admin.orgId])
    expect((await f.request(path(id))).status).toBe(404);
  expect(await f.rows(empty)).toEqual([]);
  await f.pool.query("UPDATE public.orgs SET status=0 WHERE id=$1", [p.id]);
  expect((await f.request(path(p.id))).status).toBe(404);
  await f.pool.query(
    "UPDATE public.orgs SET status=1,deleted_at=now() WHERE id=$1",
    [p.id],
  );
  expect((await f.request(path(p.id), "PATCH", p.patch)).status).toBe(404);
});

it("学校管理员只能读写本校；没有授权实现的代理商保持拒绝", async () => {
  const school = await f.seed("school", "school-admin");
  await f.initialize(school.orgId);
  expect((await read(school.orgId, school.token)).allowedActions).toEqual([
    "update",
  ]);
  const own = (await f.rows(school.orgId))[0];
  expect(
    (
      await f.request(
        path(school.orgId),
        "PATCH",
        { ...f.input(), version: own.version },
        school.token,
      )
    ).status,
  ).toBe(200);
  const other = await f.profile();
  expect(
    (await f.request(path(other.id), "GET", undefined, school.token)).status,
  ).toBe(404);
  expect(
    (await f.request(path(other.id), "PATCH", other.patch, school.token))
      .status,
  ).toBe(404);
  const agent = await f.seed("agent", null);
  await f.profileRole(agent, "agent", "all", "edit");
  expect(
    (await f.request(path(other.id), "GET", undefined, agent.token)).status,
  ).toBe(404);
});

it("查看全部、修改本部门分别校验，行操作不借用查看权限的范围", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  await f.profileRole(actor, "company", "all", "view");
  await f.profileRole(actor, "company", "dept", "edit");
  const dept = await f.department(),
    inside = await f.profile(),
    outside = await f.profile();
  await f.assign(actor.identityId, dept.id);
  await f.responsibility(dept.id, "school", inside.id);
  expect((await read(inside.id, actor.token)).allowedActions).toEqual([
    "update",
  ]);
  expect((await read(outside.id, actor.token)).allowedActions).toEqual([]);
  expect(
    (await f.request(path(outside.id), "PATCH", outside.patch, actor.token))
      .status,
  ).toBe(404);
  expect(
    (await f.request(path(inside.id), "PATCH", inside.patch, actor.token))
      .status,
  ).toBe(200);
  expect((await f.rows(outside.id))[0].version).toBe(0);
});

it("修改递增版本，联系电话省略保留、显式null清空；敏感字段审计不含明文和密文", async () => {
  const p = await f.profile(),
    before = (await f.rows(p.id))[0];
  const { contactPhone: _phone, ...withoutPhone } = p.patch;
  const response = await f.request(path(p.id), "PATCH", {
    ...withoutPhone,
    address: "新地址",
  });
  expect(response.status).toBe(200);
  expect(
    successResponseSchema(schoolProfileSchema).parse(await response.json()).data
      .version,
  ).toBe(1);
  expect((await f.rows(p.id))[0].contact_phone).toBe(before.contact_phone);
  expect(
    (
      await f.request(path(p.id), "PATCH", {
        ...p.patch,
        version: 1,
        contactPhone: "0571-12345678",
      })
    ).status,
  ).toBe(200);
  const audit = JSON.stringify(await f.audits(p.id));
  expect(audit).toContain("已修改");
  expect(audit).not.toContain("0571-12345678");
  expect(audit).not.toContain("v1:");
  expect((await read(p.id)).contactPhone).toBe("057****5678");
  expect(
    (
      await f.request(path(p.id), "PATCH", {
        ...p.patch,
        version: 2,
        contactPhone: null,
      })
    ).status,
  ).toBe(200);
  expect((await f.rows(p.id))[0]).toMatchObject({
    version: 3,
    contact_phone: null,
    contact_phone_hash: null,
  });
  expect((await f.audits(p.id)).length).toBe(3);
});

it("标识码重复与并发冲突返回12005，失败不改变版本和审计；软删除后可重用", async () => {
  const a = await f.profile(),
    b = await f.profile(),
    code = f.input().schoolCode;
  const results = await Promise.all(
    [a, b].map((p) =>
      f.request(path(p.id), "PATCH", { ...p.patch, schoolCode: code }),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const loser = results[0]?.status === 409 ? a : b;
  const failed = results.find((r) => r.status === 409);
  expect(await failed?.json()).toMatchObject({ code: 12005 });
  expect((await f.rows(loser.id))[0].version).toBe(0);
  expect(await f.audits(loser.id)).toEqual([]);
  const winner = loser.id === a.id ? b : a;
  await f.pool.query(
    "UPDATE public.school_profiles SET deleted_at=now() WHERE school_id=$1",
    [winner.id],
  );
  expect(
    (
      await f.request(path(loser.id), "PATCH", {
        ...loser.patch,
        schoolCode: code,
      })
    ).status,
  ).toBe(200);
});

it("旧版本及同版本并发只有一次成功，不多写审计", async () => {
  const p = await f.profile();
  const results = await Promise.all([
    f.request(path(p.id), "PATCH", { ...p.patch, contactName: "甲" }),
    f.request(path(p.id), "PATCH", { ...p.patch, contactName: "乙" }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(await results.find((r) => r.status === 409)?.json()).toMatchObject({
    code: 90002,
  });
  expect((await f.rows(p.id))[0].version).toBe(1);
  expect(await f.audits(p.id)).toHaveLength(1);
});

it("学段学制错误12006，其余字段格式400，失败不改变档案或审计", async () => {
  const p = await f.profile(),
    before = await f.rows(p.id);
  for (const config of [
    { stages: [1, 1], stageYears: { "1": 6 } },
    { stages: [1, 2], stageYears: { "1": 6 } },
    { stages: [1], stageYears: { "1": 6, "2": 3 } },
    { stages: [3], stageYears: { "3": 4 } },
  ]) {
    const response = await f.request(path(p.id), "PATCH", {
      ...p.patch,
      ...config,
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 12006 });
  }
  for (const fields of [
    { schoolCode: "123" },
    { contactPhone: "138****5678" },
    { schoolName: "禁止" },
    { version: -1 },
  ])
    expect(
      (await f.request(path(p.id), "PATCH", { ...p.patch, ...fields })).status,
    ).toBe(400);
  expect(await f.rows(p.id)).toEqual(before);
  expect(await f.audits(p.id)).toEqual([]);
});

it("数据库约束独立拒绝非法学制、重复学段和未配对手机号", async () => {
  const p = await f.profile();
  for (const config of [{ "1": 4, "2": 3 }, { "1": 6 }, { "1": "6", "2": 3 }])
    await expect(
      f.pool.query(
        "UPDATE public.school_profiles SET stage_years=$2 WHERE school_id=$1",
        [p.id, config],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  await expect(
    f.pool.query(
      "UPDATE public.school_profiles SET stages=ARRAY[1,1]::smallint[] WHERE school_id=$1",
      [p.id],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    f.pool.query(
      "UPDATE public.school_profiles SET contact_phone_hash=NULL WHERE school_id=$1",
      [p.id],
    ),
  ).rejects.toMatchObject({ code: "23514" });
});

it("开通流程初始化失败随调用者事务回滚，不留半成品", async () => {
  const id = await f.school();
  const repo = f.app.get(SchoolProfilesRepository);
  await expect(
    repo.transaction(async (tx) => {
      const { SchoolProfilesService } = await import(
        "../../src/modules/platform/school-profiles/index.js"
      );
      await f.app
        .get(SchoolProfilesService)
        .initialize(tx, id, f.input(), f.admin.identityId);
      throw new Error("模拟开通失败");
    }),
  ).rejects.toThrow("模拟开通失败");
  expect(await f.rows(id)).toEqual([]);
});

it("幂等键重复不再次修改；已失去目标范围时不重放旧档案", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  await f.profileRole(actor, "company", "personal", "edit");
  const p = await f.profile(),
    key = v7();
  await f.personal(actor.identityId, "school", p.id);
  expect(
    (await f.request(path(p.id), "PATCH", p.patch, actor.token, key)).status,
  ).toBe(200);
  expect(
    (await f.request(path(p.id), "PATCH", p.patch, actor.token, key)).status,
  ).toBe(409);
  expect(await f.audits(p.id)).toHaveLength(1);
  await f.pool.query(
    "DELETE FROM public.identity_scopes WHERE identity_id=$1",
    [actor.identityId],
  );
  const response = await f.request(
    path(p.id),
    "PATCH",
    p.patch,
    actor.token,
    key,
  );
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ code: 90004, data: null });
});

it("排队等待写入期间撤权，事务内重读拒绝旧身份快照", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  const role = await f.profileRole(actor, "company", "all", "edit"),
    p = await f.profile();
  const repo = f.app.get(SchoolProfilesRepository),
    original = repo.lockPolicy.bind(repo);
  let reached!: () => void, release!: () => void;
  const ready = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spy = vi
    .spyOn(repo, "lockPolicy")
    .mockImplementation(async (tx, write) => {
      if (write) {
        reached();
        await gate;
      }
      return original(tx, write);
    });
  try {
    const request = f.request(path(p.id), "PATCH", p.patch, actor.token);
    await ready;
    await f.pool.query(
      "UPDATE public.role_grants SET level='none' WHERE role_id=$1",
      [role],
    );
    release();
    expect((await request).status).toBe(403);
    expect((await f.rows(p.id))[0].version).toBe(0);
    expect(await f.audits(p.id)).toEqual([]);
  } finally {
    release();
    spy.mockRestore();
  }
});

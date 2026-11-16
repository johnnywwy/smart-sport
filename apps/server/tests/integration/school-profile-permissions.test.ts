import {
  roleDetailSchema,
  schoolProfileSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";
import { schoolProfileFixture } from "../helpers/school-profiles.js";

let f: Awaited<ReturnType<typeof schoolProfileFixture>>;
beforeAll(async () => {
  f = await schoolProfileFixture();
}, 120000);
afterAll(async () => {
  await f?.stop();
}, 30000);
const path = (id: string) => `/schools/${id}/profile`;

it("真实角色分配和档位修改接口控制同一令牌的档案读写，撤权立即生效", async () => {
  const actor = await f.seed("company", null, f.admin.orgId);
  let role = await f.create("生产");
  const assigned = await f.request(`/members/${actor.identityId}`, "PATCH", {
    version: 0,
    roleIds: [role.id],
  });
  expect(assigned.status).toBe(200);
  const p = await f.profile();
  for (const [level, getStatus, patchStatus] of [
    ["none", 403, 403],
    ["edit", 200, 200],
    ["view", 200, 403],
    ["none", 403, 403],
  ] as const) {
    const change = await f.request(`/roles/${role.id}/grants`, "PUT", {
      version: role.version,
      dataScope: "all",
      grants: role.grants.map((g) => ({
        app: g.app,
        feature: g.feature,
        grant: {
          level: g.app === "school" && g.feature === "profile" ? level : "none",
        },
      })),
    });
    expect(change.status).toBe(200);
    role = successResponseSchema(roleDetailSchema).parse(
      await change.json(),
    ).data;
    const before = (await f.rows(p.id))[0]?.version;
    expect(
      (await f.request(path(p.id), "GET", undefined, actor.token)).status,
    ).toBe(getStatus);
    expect(
      (
        await f.request(
          path(p.id),
          "PATCH",
          { ...p.patch, version: before },
          actor.token,
        )
      ).status,
    ).toBe(patchStatus);
    expect((await f.rows(p.id))[0]?.version).toBe(
      before + (patchStatus === 200 ? 1 : 0),
    );
  }
  expect(await f.audits(p.id)).toHaveLength(1);
});

it("本校只读身份不返回修改能力，未开放的部门级学校范围保持拒绝", async () => {
  const school = await f.seed("school", null);
  await f.initialize(school.orgId);
  const role = await f.profileRole(school, "school", "all", "view");
  const response = await f.request(
    path(school.orgId),
    "GET",
    undefined,
    school.token,
  );
  expect(response.status).toBe(200);
  expect(
    successResponseSchema(schoolProfileSchema).parse(await response.json()).data
      .allowedActions,
  ).toEqual([]);
  expect(
    (
      await f.request(
        path(school.orgId),
        "PATCH",
        { ...f.input(), version: 0 },
        school.token,
      )
    ).status,
  ).toBe(403);
  await f.pool.query("UPDATE public.roles SET data_scope='dept' WHERE id=$1", [
    role,
  ]);
  expect(
    (await f.request(path(school.orgId), "GET", undefined, school.token))
      .status,
  ).toBe(404);
  expect((await f.rows(school.orgId))[0]?.version).toBe(0);
});

it("本校管理员也不能读取已失效区划的学校档案", async () => {
  const school = await f.seed("school", "school-admin");
  await f.pool.query(
    "UPDATE public.orgs SET region_code='980000' WHERE id=$1",
    [school.orgId],
  );
  await f.initialize(school.orgId);
  expect(
    (await f.request(path(school.orgId), "GET", undefined, school.token))
      .status,
  ).toBe(200);
  await f.pool.query("UPDATE public.regions SET status=0 WHERE code='980000'");
  try {
    expect(
      (await f.request(path(school.orgId), "GET", undefined, school.token))
        .status,
    ).toBe(404);
  } finally {
    await f.pool.query(
      "UPDATE public.regions SET status=1 WHERE code='980000'",
    );
  }
});

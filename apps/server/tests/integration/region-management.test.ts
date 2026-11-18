import {
  regionManagementListSchema,
  regionSyncPreviewSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { RegionManagementRepository } from "../../src/modules/platform/regions/index.js";
import { importRegions } from "../../src/modules/platform/regions/region-importer.js";
import * as source from "../../src/modules/platform/regions/reviewed-regions.js";
import { roleManagementFixture } from "../helpers/role-management.js";

let f: Awaited<ReturnType<typeof roleManagementFixture>>;
const root = {
  code: "990000",
  name: "测试省",
  level: 1 as const,
  parentCode: null,
  path: "990000",
  status: 1,
};
const city = {
  code: "990100",
  name: "测试市",
  level: 2 as const,
  parentCode: root.code,
  path: "990000.990100",
  status: 1,
};
const approved = {
  source: {
    version: "审核测试版",
    reviewedAt: "2026-11-18",
    upstreamCommit: "test",
    checksum: "a".repeat(64),
  },
  seeds: [root, city],
};
beforeAll(async () => {
  f = await roleManagementFixture(true);
  vi.spyOn(source, "reviewedRegions").mockResolvedValue(approved);
}, 120000);
afterAll(async () => {
  vi.restoreAllMocks();
  await f?.stop();
}, 30000);
async function preview(token = f.admin.token) {
  const r = await f.request(
    "/region-management/sync-preview",
    "GET",
    undefined,
    token,
  );
  expect(r.status).toBe(200);
  return successResponseSchema(regionSyncPreviewSchema).parse(await r.json())
    .data;
}
async function snapshot() {
  return {
    regions: (await f.pool.query("SELECT * FROM public.regions ORDER BY code"))
      .rows,
    audits: (
      await f.pool.query(
        "SELECT * FROM public.audit_logs WHERE action='system.region.import' ORDER BY id",
      )
    ).rows,
  };
}
it("真实管理查询统计所有未删除后代学校，教育局只直接关联且保留停用状态", async () => {
  await f.pool.query(
    "INSERT INTO public.regions(code,name,level,parent_code,path) VALUES('990100','测试市',2,'990000','990000.990100'),('990101','测试区',3,'990100','990000.990100.990101')",
  );
  for (const [type, name, code, status, deleted] of [
    ["school", "直属学校", "990000", 1, false],
    ["school", "停用学校", "990101", 0, false],
    ["school", "已删学校", "990101", 1, true],
    ["bureau", "市教育局", "990100", 0, false],
    ["bureau", "第二教育局", "990100", 1, false],
  ] as const)
    await f.pool.query(
      "INSERT INTO public.orgs(id,type,name,code,region_code,status,deleted_at) VALUES($1,$2,$3,$1::uuid::text,$4,$5,$6)",
      [v7(), type, name, code, status, deleted ? new Date() : null],
    );
  const r = await f.request("/region-management");
  expect(r.status).toBe(200);
  const list = successResponseSchema(regionManagementListSchema).parse(
    await r.json(),
  ).data;
  expect(list.items[0]).toMatchObject({ schoolCount: 2, bureaus: [] });
  const cities = await f.request(
    "/region-management?parent=990000&keyword=测试&pageSize=1",
  );
  const data = successResponseSchema(regionManagementListSchema).parse(
    await cities.json(),
  ).data;
  expect(data.items[0]).toMatchObject({
    schoolCount: 1,
    parentName: "测试省",
    bureaus: [
      { name: "市教育局", status: 0 },
      { name: "第二教育局", status: 1 },
    ],
  });
  expect((await f.request("/region-management?pageSize=101")).status).toBe(400);
});
it("预览撤销关联影响且整批拒绝执行，不修改组织及范围", async () => {
  const p = await preview();
  expect(p.blocked).toBe(true);
  expect(p.impacts.some((i) => i.name === "停用学校")).toBe(true);
  const before = await snapshot();
  const r = await f.request("/region-management/sync", "POST", {
    fingerprint: p.fingerprint,
  });
  expect(r.status).toBe(400);
  expect(await snapshot()).toEqual(before);
});
it("指纹绑定关联数据和审核文件，拒绝旧预览", async () => {
  const p = await preview();
  await f.pool.query(
    "UPDATE public.orgs SET name='改名后的学校' WHERE name='直属学校'",
  );
  expect(
    (
      await f.request("/region-management/sync", "POST", {
        fingerprint: p.fingerprint,
      })
    ).status,
  ).toBe(409);
  const fresh = await preview();
  vi.mocked(source.reviewedRegions).mockResolvedValueOnce({
    ...approved,
    source: { ...approved.source, version: "另一审核版" },
  });
  expect(
    (
      await f.request("/region-management/sync", "POST", {
        fingerprint: fresh.fingerprint,
      })
    ).status,
  ).toBe(409);
});
it("无权限及非公司拒绝，真实角色对同一令牌授权撤权即时生效", async () => {
  const a = await f.seed("company", null, f.admin.orgId),
    roleId = v7();
  await f.pool.query(
    "INSERT INTO public.roles(id,kind,identity_type,org_id,code,name,data_scope,base_role_id) SELECT $1,'custom','company',$2,$1::uuid::text,'区划验收','all',id FROM public.roles WHERE code='company-super-admin'",
    [roleId, a.orgId],
  );
  await f.pool.query(
    "INSERT INTO public.role_grants(role_id,app_code,feature_code,level,actions) SELECT $1,app_code,code,'none',NULL FROM public.features",
    [roleId],
  );
  await f.pool.query("INSERT INTO public.identity_roles VALUES($1,$2)", [
    a.identityId,
    roleId,
  ]);
  const check = () =>
    f.request("/region-management/sync-preview", "GET", undefined, a.token);
  expect((await check()).status).toBe(403);
  let role = await f.detail(roleId);
  const grant = async (actions: string[]) => {
    const r = await f.request(`/roles/${roleId}/grants`, "PUT", {
      version: role.version,
      dataScope: "all",
      grants: role.grants.map((g) => ({
        app: g.app,
        feature: g.feature,
        grant:
          g.app === "system" && g.feature === "region"
            ? { level: "custom", actions }
            : { level: "none" },
      })),
    });
    expect(r.status).toBe(200);
    role = await f.detail(roleId);
  };
  await grant(["view", "import"]);
  expect((await check()).status).toBe(200);
  await grant(["view"]);
  expect((await check()).status).toBe(403);
  expect(
    (await f.request("/region-management", "GET", undefined, a.token)).status,
  ).toBe(200);
  const school = await f.seed("school", "school-admin");
  expect(
    (await f.request("/region-management", "GET", undefined, school.token))
      .status,
  ).toBe(403);
});
it("安全同步同事务审计且支持幂等，失败完整回滚，不改变组织归属", async () => {
  // 测试审核版保留现有区县；只改名及新增无关联区划。
  const seeds = (
    await f.pool.query(
      'SELECT code,name,level,parent_code AS "parentCode",path,status FROM public.regions ORDER BY code',
    )
  ).rows;
  const data = {
    ...approved,
    seeds: [
      ...seeds.map((r) =>
        r.code === "990100" ? { ...r, name: "测试新市名" } : r,
      ),
      {
        code: "980000",
        name: "新增省",
        level: 1 as const,
        parentCode: null,
        path: "980000",
        status: 1,
      },
    ],
  };
  vi.mocked(source.reviewedRegions).mockResolvedValue(data);
  const p = await preview();
  expect(p.blocked).toBe(false);
  const repo = f.app.get(RegionManagementRepository);
  const fail = vi
    .spyOn(repo, "audit")
    .mockRejectedValueOnce(new Error("audit failed"));
  const before = await snapshot();
  expect(
    (
      await f.request("/region-management/sync", "POST", {
        fingerprint: p.fingerprint,
      })
    ).status,
  ).toBe(500);
  expect(await snapshot()).toEqual(before);
  fail.mockRestore();
  const organizations = (
    await f.pool.query("SELECT * FROM public.orgs ORDER BY id")
  ).rows;
  const key = v7();
  expect(
    (
      await f.request(
        "/region-management/sync",
        "POST",
        { fingerprint: p.fingerprint },
        f.admin.token,
        key,
      )
    ).status,
  ).toBe(201);
  expect(
    (
      await f.request(
        "/region-management/sync",
        "POST",
        { fingerprint: p.fingerprint },
        f.admin.token,
        key,
      )
    ).status,
  ).toBe(409);
  expect((await snapshot()).audits).toHaveLength(1);
  expect(
    (await f.pool.query("SELECT * FROM public.orgs ORDER BY id")).rows,
  ).toEqual(organizations);
  const unchanged = await preview();
  expect(unchanged.changes).toHaveLength(0);
  expect(
    (
      await f.request("/region-management/sync", "POST", {
        fingerprint: unchanged.fingerprint,
      })
    ).status,
  ).toBe(400);
});
it("原命令行导入同样阻止影响归属的撤销，不绕过网页保护", async () => {
  const before = await snapshot();
  await expect(
    importRegions(
      f.pool,
      new URL("../../../../deploy/seed/regions.csv", import.meta.url),
    ),
  ).rejects.toThrow("区划变更影响");
  expect(await snapshot()).toEqual(before);
});

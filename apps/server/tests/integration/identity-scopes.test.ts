import {
  apiResponseSchema,
  dataScopeSchema,
  identityScopesSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { Redis } from "ioredis";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { IdentityContextService } from "../../src/modules/platform/identity-context/index.js";
import {
  roleInput,
  roleManagementFixture,
} from "../helpers/role-management.js";

let f: Awaited<ReturnType<typeof roleManagementFixture>>;
let redis: Redis;
beforeAll(async () => {
  f = await roleManagementFixture();
  redis = new Redis(f.config.REDIS_URL);
  await f.pool.query(`
    INSERT INTO public.regions(code,name,level,parent_code,path) VALUES
    ('990100','市甲',2,'990000','990000.990100'),
    ('990101','区甲',3,'990100','990000.990100.990101'),
    ('990200','市乙',2,'990000','990000.990200'),
    ('980000','其他省',1,NULL,'980000')`);
}, 120000);
afterAll(async () => {
  redis?.disconnect();
  await f?.stop();
}, 30000);

function set(
  id: string,
  version: number,
  scopes: unknown[],
  token = f.admin.token,
  query = "",
  key = v7(),
) {
  return f.request(
    `/identities/${id}/scopes${query}`,
    "PUT",
    { version, scopes },
    token,
    key,
  );
}
async function data(response: Response) {
  expect(response.status).toBe(200);
  return successResponseSchema(identityScopesSchema).parse(
    await response.json(),
  ).data;
}
async function denied(response: Response, status: number, code: number) {
  expect(response.status).toBe(status);
  expect(apiResponseSchema.parse(await response.json()).code).toBe(code);
}
async function state(id: string) {
  const identity = await f.pool.query(
    "SELECT version FROM public.identities WHERE id=$1",
    [id],
  );
  const scopes = await f.pool.query(
    "SELECT scope_type,scope_value FROM public.identity_scopes WHERE identity_id=$1 ORDER BY scope_type,scope_value",
    [id],
  );
  const audits = await f.pool.query(
    "SELECT changes FROM public.audit_logs WHERE target_id=$1 AND action='identity.scopes.update' ORDER BY created_at",
    [id],
  );
  return {
    version: identity.rows[0].version,
    scopes: scopes.rows,
    audits: audits.rows,
  };
}
async function school(region = "990101") {
  const row = await f.seed("school", "school-admin");
  await f.pool.query("UPDATE public.orgs SET region_code=$2 WHERE id=$1", [
    row.orgId,
    region,
  ]);
  return row;
}

it("公司整体替换与清空共用成员版本，幂等重放只写一次审计", async () => {
  const target = await f.seed("company", "company-production", f.admin.orgId);
  const s = await school();
  const input = [
    { type: "school", value: s.orgId },
    { type: "region", value: "990100" },
  ];
  const key = v7();
  expect(
    await data(await set(target.identityId, 0, input, undefined, "", key)),
  ).toMatchObject({
    identityId: target.identityId,
    version: 1,
    scopes: expect.arrayContaining(input),
  });
  await denied(
    await set(target.identityId, 0, input, undefined, "", key),
    409,
    90003,
  );
  const saved = await state(target.identityId);
  expect(saved.audits).toHaveLength(1);
  expect(saved.audits[0].changes.scopes[0]).toEqual([]);
  await denied(await set(target.identityId, 0, []), 409, 90002);
  expect(await state(target.identityId)).toEqual(saved);
  const edit = await f.request(`/members/${target.identityId}`, "PATCH", {
    version: 1,
    title: "更新职务",
  });
  expect(edit.status).toBe(200);
  await denied(await set(target.identityId, 1, []), 409, 90002);
  expect(await data(await set(target.identityId, 2, []))).toMatchObject({
    version: 3,
    scopes: [],
  });
  expect((await state(target.identityId)).audits).toHaveLength(2);
});

it("教育局按完整区划路径校验本级和后代，其他组织和辖区范围均不可探测", async () => {
  const bureau = await f.seed("bureau", "bureau-admin");
  await f.pool.query(
    "UPDATE public.orgs SET region_code='990100' WHERE id=$1",
    [bureau.orgId],
  );
  const target = await f.seed("bureau", null, bureau.orgId);
  const inside = await school();
  const outside = await school("990200");
  await data(
    await set(
      target.identityId,
      0,
      [
        { type: "region", value: "990100" },
        { type: "region", value: "990101" },
        { type: "school", value: inside.orgId },
      ],
      bureau.token,
    ),
  );
  const saved = await state(target.identityId);
  for (const scope of [
    { type: "region", value: "990000" },
    { type: "region", value: "990200" },
    { type: "region", value: "980000" },
    { type: "school", value: outside.orgId },
    { type: "school", value: v7() },
    { type: "region", value: "970000" },
  ]) {
    await denied(
      await set(target.identityId, 1, [scope], bureau.token),
      404,
      90004,
    );
    expect(await state(target.identityId)).toEqual(saved);
  }
  await denied(await set(f.admin.identityId, 0, [], bureau.token), 404, 90004);
  await denied(
    await set(
      f.admin.identityId,
      0,
      [],
      bureau.token,
      `?orgId=${f.admin.orgId}`,
    ),
    403,
    11101,
  );
  // 超管指定目标组织，也不能扩大教育局的辖区。
  await denied(
    await set(
      target.identityId,
      1,
      [{ type: "school", value: outside.orgId }],
      undefined,
      `?orgId=${bureau.orgId}`,
    ),
    404,
    90004,
  );
  await data(
    await set(target.identityId, 1, [], undefined, `?orgId=${bureau.orgId}`),
  );
});

it("停用/删除学校、非学校组织和停用区划均不能写入，失败整体回滚", async () => {
  const target = await f.seed("company", null, f.admin.orgId);
  await data(
    await set(target.identityId, 0, [{ type: "region", value: "990000" }]),
  );
  const disabled = await school();
  const deleted = await school();
  await f.pool.query("UPDATE public.orgs SET status=0 WHERE id=$1", [
    disabled.orgId,
  ]);
  await f.pool.query("UPDATE public.orgs SET deleted_at=now() WHERE id=$1", [
    deleted.orgId,
  ]);
  await f.pool.query(
    "INSERT INTO public.regions VALUES('970000','停用省',1,NULL,'970000',0)",
  );
  const saved = await state(target.identityId);
  for (const scope of [
    { type: "school", value: disabled.orgId },
    { type: "school", value: deleted.orgId },
    { type: "school", value: f.admin.orgId },
    { type: "region", value: "970000" },
  ]) {
    await denied(
      await set(target.identityId, 1, [
        { type: "region", value: "990100" },
        scope,
      ]),
      404,
      90004,
    );
    expect(await state(target.identityId)).toEqual(saved);
  }
});

it("无修改权限为403，不可管理更高权限成员，撤权后同一令牌立即拒绝", async () => {
  const readonly = await f.seed(
    "company",
    "company-readonly-auditor",
    f.admin.orgId,
  );
  const target = await f.seed("company", null, f.admin.orgId);
  const before = await state(target.identityId);
  await denied(await set(target.identityId, 0, [], readonly.token), 403, 11101);
  const custom = await f.create("超级管理员");
  const input = roleInput(custom);
  input.grants = input.grants.map((g) => ({
    ...g,
    grant: {
      level: g.app === "org" && g.feature === "member" ? "manage" : "none",
    },
  }));
  expect(
    (await f.request(`/roles/${custom.id}/grants`, "PUT", input)).status,
  ).toBe(200);
  const manager = await f.seed("company", null, f.admin.orgId);
  await f.pool.query("INSERT INTO public.identity_roles VALUES($1,$2)", [
    manager.identityId,
    custom.id,
  ]);
  await denied(await set(f.admin.identityId, 0, [], manager.token), 403, 11102);
  await data(
    await set(
      target.identityId,
      0,
      [{ type: "region", value: "990000" }],
      manager.token,
    ),
  );
  const saved = await state(target.identityId);
  const client = await f.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1936749167,41)");
    const pending = set(target.identityId, 1, [], manager.token);
    await vi.waitFor(async () => {
      const waiting = await f.pool.query(
        "SELECT count(*)::int AS total FROM pg_stat_activity WHERE wait_event='advisory'",
      );
      expect(waiting.rows[0].total).toBeGreaterThan(0);
    });
    await client.query(
      "DELETE FROM public.identity_roles WHERE identity_id=$1",
      [manager.identityId],
    );
    await client.query("COMMIT");
    await denied(await pending, 403, 11101);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
  await denied(await set(target.identityId, 1, [], manager.token), 403, 11101);
  expect(await state(target.identityId)).toEqual(saved);
  expect(before.scopes).toEqual([]);
});

it("当前未开放的类型拒绝非空范围，但允许安全清空；公司不能提交年级学院", async () => {
  for (const [type, role] of [
    ["school", "school-admin"],
    ["agent", "agent-admin"],
  ] as const) {
    const target = await f.seed(type, role);
    await denied(
      await set(
        target.identityId,
        0,
        [{ type: "school", value: target.orgId }],
        target.token,
      ),
      422,
      12004,
    );
    expect(
      await data(await set(target.identityId, 0, [], target.token)),
    ).toMatchObject({ version: 1, scopes: [] });
  }
  const target = await f.seed("company", null, f.admin.orgId);
  for (const scope of [
    { type: "grade", value: "11" },
    { type: "college", value: v7() },
  ])
    await denied(await set(target.identityId, 0, [scope]), 422, 12004);
  expect(await state(target.identityId)).toEqual({
    version: 0,
    scopes: [],
    audits: [],
  });
});

it("同版本并发写入仅一次成功，胜出范围与审计一致", async () => {
  const target = await f.seed("company", null, f.admin.orgId);
  const responses = await Promise.all(
    ["990100", "990200"].map((value) =>
      set(target.identityId, 0, [{ type: "region", value }]),
    ),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const saved = await state(target.identityId);
  expect(saved.version).toBe(1);
  expect(saved.audits).toHaveLength(1);
  expect(saved.scopes).toHaveLength(1);
  expect(saved.audits[0].changes.scopes[1][0].value).toBe(
    saved.scopes[0].scope_value,
  );
});

it("成功后清除目标上下文和四档范围缓存，保留其他身份缓存", async () => {
  const target = await f.seed("company", "company-production", f.admin.orgId);
  const contexts = f.app.get(IdentityContextService);
  await contexts.load(target.identityId);
  expect(await redis.exists(`ctx:${target.identityId}`)).toBe(1);
  const keys = dataScopeSchema.options.map(
    (option) => `scope:${target.identityId}:${option}`,
  );
  for (const key of keys) await redis.set(key, "old", "EX", 600);
  const unrelated = `scope:${v7()}:all`;
  await redis.set(unrelated, "keep", "EX", 600);
  const before = await redis.get("ctx:revision");
  await data(
    await set(target.identityId, 0, [{ type: "region", value: "990000" }]),
  );
  expect(await redis.mget(...keys, `ctx:${target.identityId}`)).toEqual(
    [...keys, ""].map(() => null),
  );
  expect(await redis.get(unrelated)).toBe("keep");
  expect(Number(await redis.get("ctx:revision"))).toBeGreaterThan(
    Number(before),
  );
});

it("学校UUID大小写统一存储并检测逻辑重复，不引发数据库约束错误", async () => {
  const target = await f.seed("company", null, f.admin.orgId);
  const s = await school();
  expect(
    await data(
      await set(target.identityId.toUpperCase(), 0, [
        { type: "school", value: s.orgId.toUpperCase() },
      ]),
    ),
  ).toMatchObject({
    identityId: target.identityId,
    scopes: [{ type: "school", value: s.orgId }],
  });
  const before = await state(target.identityId);
  await denied(
    await set(target.identityId, 1, [
      { type: "school", value: s.orgId },
      { type: "school", value: s.orgId.toUpperCase() },
    ]),
    400,
    90001,
  );
  expect(await state(target.identityId)).toEqual(before);
});

it("请求契约与幂等头缺失均返回400，拒绝后身份保持原版本", async () => {
  const target = await f.seed("company", null, f.admin.orgId);
  for (const input of [
    { scopes: [] },
    { version: -1, scopes: [] },
    { version: 0, scopes: [], orgId: f.admin.orgId },
    { version: 0, scopes: [{ type: "class", value: v7() }] },
  ])
    await denied(
      await f.request(`/identities/${target.identityId}/scopes`, "PUT", input),
      400,
      90001,
    );
  const response = await fetch(
    `${f.base}/api/v1/identities/${target.identityId}/scopes`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${f.admin.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ version: 0, scopes: [] }),
    },
  );
  await denied(response, 400, 90001);
  expect(await state(target.identityId)).toEqual({
    version: 0,
    scopes: [],
    audits: [],
  });
});

import {
  authSessionSchema,
  loginResponseSchema,
  type SystemParam,
  successResponseSchema,
  systemParamDefinitions,
  systemParamListSchema,
  systemParamSchema,
} from "@smart-sport/contracts";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { migratePublic } from "../../src/database/migrate.js";
import { PasswordHasher } from "../../src/infra/crypto/password-hasher.js";
import {
  ParamsRepository,
  ParamsService,
} from "../../src/modules/platform/params/index.js";
import {
  roleInput,
  roleManagementFixture,
} from "../helpers/role-management.js";

let f: Awaited<ReturnType<typeof roleManagementFixture>>,
  repository: ParamsRepository,
  service: ParamsService;
beforeAll(async () => {
  f = await roleManagementFixture(true);
  repository = f.app.get(ParamsRepository);
  service = f.app.get(ParamsService);
}, 120000);
afterAll(async () => {
  await f?.stop();
}, 30000);
async function list(query = "", token = f.admin.token) {
  const r = await f.request(`/system-params${query}`, "GET", undefined, token);
  expect(r.status).toBe(200);
  return successResponseSchema(systemParamListSchema).parse(await r.json())
    .data;
}
async function row(key = "password.min_length") {
  const found = (await list()).items.find((r) => r.key === key);
  if (!found) throw new Error("缺少参数");
  return found;
}
const input = (r: SystemParam, value = r.value) => ({
  value,
  version: r.version,
  reason: "参数接口验收",
});
async function snapshot() {
  return {
    rows: (await f.pool.query("SELECT * FROM public.sys_params ORDER BY id"))
      .rows,
    audits: (
      await f.pool.query(
        "SELECT * FROM public.audit_logs WHERE action='system.param.update' ORDER BY id",
      )
    ).rows,
  };
}
async function actor(actions: string[]) {
  const p = await f.seed("company", null, f.admin.orgId),
    roleId = v7();
  await f.pool.query(
    `INSERT INTO public.roles(id,kind,identity_type,org_id,code,name,data_scope,base_role_id) SELECT $1,'custom','company',$2,$1::uuid::text,'参数验收角色','all',id FROM public.roles WHERE code='company-super-admin'`,
    [roleId, p.orgId],
  );
  await f.pool.query(
    `INSERT INTO public.role_grants(role_id,app_code,feature_code,level,actions) SELECT $1,app_code,code,CASE WHEN app_code='system' AND code='param' THEN 'custom' ELSE 'none' END, CASE WHEN app_code='system' AND code='param' THEN $2::text[] ELSE NULL END FROM public.features`,
    [roleId, actions],
  );
  await f.pool.query("INSERT INTO public.identity_roles VALUES($1,$2)", [
    p.identityId,
    roleId,
  ]);
  return { ...p, roleId };
}
it("迁移与启动同步幂等，预置八项默认值及只读目录，保留管理员值", async () => {
  expect(await migratePublic(f.pool)).toEqual([]);
  const result = await list();
  expect(result.total).toBe(8);
  for (const d of systemParamDefinitions)
    expect(result.items.find((r) => r.key === d.key)).toMatchObject({
      value: d.defaultValue,
      min: d.min,
      max: d.max,
      allowedActions: ["update"],
    });
  const r = await row();
  expect(
    (await f.request(`/system-params/${r.id}`, "PATCH", input(r, 12))).status,
  ).toBe(200);
  const before = await snapshot();
  await Promise.all([repository.initialize(), repository.initialize()]);
  expect(await snapshot()).toEqual(before);
  expect(await service.get("password.min_length")).toBe(12);
});
it("查询分页、稳定排序、关键字转义及详情返回真实能力", async () => {
  const first = await list("?pageSize=3&sort=updatedAt:desc");
  const second = await list("?pageSize=3&page=2&sort=updatedAt:desc");
  expect(first.items).toHaveLength(3);
  expect(second.items).toHaveLength(3);
  expect(new Set([...first.items, ...second.items].map((r) => r.id)).size).toBe(
    6,
  );
  expect((await list("?keyword=密码")).total).toBe(2);
  for (const text of ["%", "_", "\\"])
    expect((await list(`?keyword=${encodeURIComponent(text)}`)).total).toBe(0);
  const r = await row();
  const detail = await f.request(`/system-params/${r.id.toUpperCase()}`);
  expect(detail.status).toBe(200);
  expect(
    successResponseSchema(systemParamSchema).parse(await detail.json()).data,
  ).toEqual(r);
});
it("修改值、原因和审计同事务提交，另一个服务实例立即读取", async () => {
  const r = await row("subscription.trial_days");
  const response = await f.request(`/system-params/${r.id}`, "PATCH", {
    ...input(r, 60),
    reason: " 新服务试用期调整 ",
  });
  expect(response.status).toBe(200);
  const saved = successResponseSchema(systemParamSchema).parse(
    await response.json(),
  ).data;
  expect(saved).toMatchObject({ value: 60, version: r.version + 1 });
  const other = new ParamsService(repository);
  expect(await other.get("subscription.trial_days")).toBe(60);
  const audit = (
    await f.pool.query(
      "SELECT * FROM public.audit_logs WHERE target_id=$1 AND action='system.param.update'",
      [r.id],
    )
  ).rows[0];
  expect(audit.changes).toMatchObject({
    key: r.key,
    value: [30, 60],
    reason: "新服务试用期调整",
  });
  expect(audit.identity_id).toBe(f.admin.identityId);
});
it("逐项上下界、类型、原因和未知字段非法时拒绝，状态和审计均不变", async () => {
  const before = await snapshot();
  for (const d of systemParamDefinitions) {
    const r = await row(d.key);
    for (const value of [d.min - 1, d.max + 1, "8", 1.5, null, true]) {
      const response = await f.request(`/system-params/${r.id}`, "PATCH", {
        ...input(r),
        value,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 90001,
        data: { fields: { value: expect.any(Array) } },
      });
    }
  }
  const r = await row();
  for (const extra of [
    { version: undefined },
    { reason: " " },
    { reason: undefined },
    { key: "other" },
    { valueSchema: {} },
    { name: "自定义" },
  ])
    expect(
      (
        await f.request(`/system-params/${r.id}`, "PATCH", {
          ...input(r),
          ...extra,
        })
      ).status,
    ).toBe(400);
  expect(await snapshot()).toEqual(before);
});
it("无令牌、账号级、只读、无权限和学校身份按真实权限拒绝", async () => {
  const read = await actor(["view"]),
    none = await actor([]),
    school = await f.seed("school", "school-admin");
  const r = await row();
  const before = await snapshot();
  expect((await fetch(`${f.base}/api/v1/system-params`)).status).toBe(401);
  expect(
    (await f.request("/system-params", "GET", undefined, f.admin.account))
      .status,
  ).toBe(401);
  expect(
    (await list("", read.token)).items.every(
      (r) => r.allowedActions.length === 0,
    ),
  ).toBe(true);
  for (const token of [none.token, school.token]) {
    expect(
      (await f.request("/system-params", "GET", undefined, token)).status,
    ).toBe(403);
    expect(
      (await f.request(`/system-params/${r.id}`, "GET", undefined, token))
        .status,
    ).toBe(403);
  }
  for (const token of [read.token, none.token, school.token])
    expect(
      (await f.request(`/system-params/${r.id}`, "PATCH", input(r), token))
        .status,
    ).toBe(403);
  expect(await snapshot()).toEqual(before);
});
it("旧版本和同版本并发修改返回90002，审计失败整体回滚", async () => {
  const r = await row();
  const results = await Promise.all(
    [13, 14].map((value) =>
      f.request(`/system-params/${r.id}`, "PATCH", input(r, value)),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(await results.find((r) => r.status === 409)?.json()).toMatchObject({
    code: 90002,
  });
  const current = await row(),
    before = await snapshot();
  const spy = vi
    .spyOn(repository, "audit")
    .mockRejectedValue(new Error("审计写入失败"));
  try {
    expect(
      (
        await f.request(
          `/system-params/${current.id}`,
          "PATCH",
          input(current, 16),
        )
      ).status,
    ).toBe(500);
  } finally {
    spy.mockRestore();
  }
  expect(await snapshot()).toEqual(before);
});
it("真实角色修改授权撤权，同一令牌PATCH依次403、200、403", async () => {
  const p = await actor(["view"]);
  for (const level of ["view", "edit", "view"] as const) {
    const grants = roleInput(await f.detail(p.roleId));
    grants.grants = grants.grants.map((g) =>
      g.app === "system" && g.feature === "param"
        ? { ...g, grant: { level } }
        : g,
    );
    expect(
      (await f.request(`/roles/${p.roleId}/grants`, "PUT", grants)).status,
    ).toBe(200);
    const r = await row(),
      before = await snapshot();
    expect(
      (
        await f.request(
          `/system-params/${r.id}`,
          "PATCH",
          input(r, 16),
          p.token,
        )
      ).status,
    ).toBe(level === "edit" ? 200 : 403);
    if (level !== "edit") expect(await snapshot()).toEqual(before);
  }
});
it("排队时撤权后事务内重读拒绝写入", async () => {
  const p = await actor(["view", "update"]),
    r = await row(),
    before = await snapshot();
  let reached!: () => void, release!: () => void;
  const ready = new Promise<void>((r) => {
      reached = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  const original = repository.lockPolicy.bind(repository);
  const spy = vi
    .spyOn(repository, "lockPolicy")
    .mockImplementation(async (tx) => {
      reached();
      await gate;
      return original(tx);
    });
  try {
    const pending = f.request(
      `/system-params/${r.id}`,
      "PATCH",
      input(r, 18),
      p.token,
    );
    await ready;
    await f.pool.query(
      "UPDATE public.role_grants SET actions=ARRAY['view'] WHERE role_id=$1 AND app_code='system' AND feature_code='param'",
      [p.roleId],
    );
    release();
    expect((await pending).status).toBe(403);
  } finally {
    release();
    spy.mockRestore();
  }
  expect(await snapshot()).toEqual(before);
});
it("未知与软删资源404，非法路由及查询400，没有新增删除入口", async () => {
  for (const path of [
    "/system-params/not-id",
    "/system-params?schoolId=x",
    "/system-params?sort=value:asc",
    "/system-params?pageSize=101",
  ])
    expect((await f.request(path)).status).toBe(400);
  const r = await row();
  expect((await f.request(`/system-params/${v7()}`)).status).toBe(404);
  expect(
    (await f.request(`/system-params/${v7()}`, "PATCH", input(r))).status,
  ).toBe(404);
  expect((await f.request("/system-params", "POST", input(r))).status).toBe(
    404,
  );
  expect(
    (
      await f.request(`/system-params/${r.id}`, "DELETE", {
        version: r.version,
      })
    ).status,
  ).toBe(404);
  await f.pool.query(
    "UPDATE public.sys_params SET deleted_at=now() WHERE id=$1",
    [r.id],
  );
  try {
    expect((await f.request(`/system-params/${r.id}`)).status).toBe(404);
    expect(
      (await f.request(`/system-params/${r.id}`, "PATCH", input(r))).status,
    ).toBe(404);
  } finally {
    await f.pool.query(
      "UPDATE public.sys_params SET deleted_at=NULL WHERE id=$1",
      [r.id],
    );
  }
});
it("数据库也拒绝越界和未知参数，业务事务读取可一起回滚", async () => {
  const before = await snapshot();
  for (const value of [0, 65, "8", null])
    await expect(
      f.pool.query(
        "UPDATE public.sys_params SET value=$1::jsonb WHERE key='password.min_length'",
        [JSON.stringify(value)],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  await expect(
    repository.transaction(async (tx) => {
      const r = await repository.value("password.min_length", tx);
      if (!r) throw new Error("缺少参数");
      await repository.update(tx, r, 20, f.admin.identityId);
      expect(await service.get("password.min_length", tx)).toBe(20);
      throw new Error("业务回滚");
    }),
  ).rejects.toThrow("业务回滚");
  expect(await snapshot()).toEqual(before);
});
it("密码到期登录强制改密并禁止绕过选择身份，0关闭且保留首次改密要求", async () => {
  const p = await f.seed("company", "company-super-admin", f.admin.orgId);
  const password = "Sport2026";
  await f.pool.query(
    "UPDATE public.users SET password_hash=$1,must_change_password=false,password_changed_at=now()-interval '31 days' WHERE id=$2",
    [await new PasswordHasher().hash(password), p.userId],
  );
  let expiry = await row("password.expire_days");
  expect(
    (await f.request(`/system-params/${expiry.id}`, "PATCH", input(expiry, 30)))
      .status,
  ).toBe(200);
  const login = await f.request("/auth/login", "POST", {
    account: p.userId,
    password,
  });
  expect(login.status).toBe(200);
  const body = successResponseSchema(loginResponseSchema).parse(
    await login.json(),
  );
  expect(body.data).toMatchObject({
    mustChangePassword: true,
    selectedIdentity: null,
  });
  expect(
    (
      await f.request(
        "/auth/select-identity",
        "POST",
        { identityId: p.identityId },
        body.data.accessToken,
      )
    ).status,
  ).toBe(403);
  const session = await f.request(
    "/auth/session",
    "GET",
    undefined,
    body.data.accessToken,
  );
  expect(
    successResponseSchema(authSessionSchema).parse(await session.json()).data
      .mustChangePassword,
  ).toBe(true);
  expiry = await row("password.expire_days");
  expect(
    (await f.request(`/system-params/${expiry.id}`, "PATCH", input(expiry, 0)))
      .status,
  ).toBe(200);
  const again = await f.request("/auth/login", "POST", {
    account: p.userId,
    password,
  });
  expect(
    successResponseSchema(loginResponseSchema).parse(await again.json()).data
      .mustChangePassword,
  ).toBe(true);
  await f.pool.query(
    "UPDATE public.users SET must_change_password=false WHERE id=$1",
    [p.userId],
  );
  const disabled = await f.request("/auth/login", "POST", {
    account: p.userId,
    password,
  });
  expect(
    successResponseSchema(loginResponseSchema).parse(await disabled.json())
      .data,
  ).toMatchObject({
    mustChangePassword: false,
    selectedIdentity: expect.any(Object),
  });
});
it("生产改密读取最新最少长度，失败保留密码，成功后解除首次改密", async () => {
  const p = await f.seed("company", "company-super-admin", f.admin.orgId),
    oldPassword = "OldSport2026";
  await f.pool.query(
    "UPDATE public.users SET password_hash=$1,must_change_password=true WHERE id=$2",
    [await new PasswordHasher().hash(oldPassword), p.userId],
  );
  const r = await row();
  expect(
    (await f.request(`/system-params/${r.id}`, "PATCH", input(r, 20))).status,
  ).toBe(200);
  const login = await f.request("/auth/login", "POST", {
    account: p.userId,
    password: oldPassword,
  });
  expect(login.status).toBe(200);
  const body = successResponseSchema(loginResponseSchema).parse(
    await login.json(),
  ).data;
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("登录缺少刷新凭证");
  const before = (
    await f.pool.query("SELECT password_hash FROM public.users WHERE id=$1", [
      p.userId,
    ])
  ).rows[0];
  const change = (newPassword: string) =>
    fetch(`${f.base}/api/v1/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${body.accessToken}`,
        Cookie: cookie,
      },
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  const mode = f.config.NODE_ENV;
  f.config.NODE_ENV = "production";
  try {
    const rejected = await change("NewSport2026");
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({
      code: 10006,
      data: { fields: { newPassword: ["至少需要 20 个字符"] } },
    });
    expect(
      (
        await f.pool.query(
          "SELECT password_hash FROM public.users WHERE id=$1",
          [p.userId],
        )
      ).rows[0],
    ).toEqual(before);
    expect((await change("NewSport2026LongEnough")).status).toBe(200);
  } finally {
    f.config.NODE_ENV = mode;
  }
  const fresh = (
    await f.pool.query(
      "SELECT must_change_password,password_changed_at FROM public.users WHERE id=$1",
      [p.userId],
    )
  ).rows[0];
  expect(fresh.must_change_password).toBe(false);
  expect(fresh.password_changed_at).toBeInstanceOf(Date);
  const again = await f.request("/auth/login", "POST", {
    account: p.userId,
    password: "NewSport2026LongEnough",
  });
  expect(again.status).toBe(200);
  expect(
    successResponseSchema(loginResponseSchema).parse(await again.json()).data
      .mustChangePassword,
  ).toBe(false);
});

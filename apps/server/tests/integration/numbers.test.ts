import {
  type NumberRule,
  type NumberType,
  numberRuleListSchema,
  numberRuleSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { v7 } from "uuid";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { migratePublic } from "../../src/database/migrate.js";
import {
  NumbersRepository,
  NumbersService,
} from "../../src/modules/foundation/numbers/index.js";
import {
  roleInput,
  roleManagementFixture,
} from "../helpers/role-management.js";

let f: Awaited<ReturnType<typeof roleManagementFixture>>;
let repository: NumbersRepository, numbers: NumbersService, year: number;
beforeAll(async () => {
  f = await roleManagementFixture();
  repository = f.app.get(NumbersRepository);
  numbers = f.app.get(NumbersService);
  year = await repository.transaction((tx) => repository.year(tx));
  await f.pool.query(
    "CREATE TABLE public.number_test_documents(no text PRIMARY KEY)",
  );
}, 120000);
afterAll(async () => {
  await f?.stop();
}, 30000);
beforeEach(async () => {
  await f.pool.query("DELETE FROM public.number_test_documents");
  await f.pool.query("DELETE FROM public.number_issues");
  await f.pool.query("DELETE FROM public.number_rules");
  await f.pool.query(
    "DELETE FROM public.audit_logs WHERE action='number.rule.update'",
  );
  await numbers.onModuleInit();
});
const next = (type: NumberType = "task", service = numbers) =>
  repository.transaction((tx) => service.next(type, tx));
async function list(token = f.admin.token) {
  const r = await f.request("/number-rules", "GET", undefined, token);
  expect(r.status).toBe(200);
  return successResponseSchema(numberRuleListSchema).parse(await r.json()).data;
}
async function rule(type: NumberType = "task") {
  const row = (await list()).find((r) => r.type === type);
  if (!row) throw new Error("缺少编号规则");
  return row;
}
const input = (row: NumberRule) => ({
  version: row.version,
  prefix: row.prefix,
  digits: row.digits,
  reset: row.reset,
});
async function snapshot() {
  return {
    rules: (
      await f.pool.query("SELECT * FROM public.number_rules ORDER BY type")
    ).rows,
    issues: (
      await f.pool.query("SELECT * FROM public.number_issues ORDER BY no")
    ).rows,
    audits: (
      await f.pool.query(
        "SELECT * FROM public.audit_logs WHERE action='number.rule.update' ORDER BY id",
      )
    ).rows,
  };
}
async function actor(actions: string[]) {
  const person = await f.seed("company", null, f.admin.orgId),
    roleId = v7();
  await f.pool.query(
    `INSERT INTO public.roles(id,kind,identity_type,org_id,code,name,data_scope,base_role_id)
     SELECT $1,'custom','company',$2,$1::uuid::text,'编号测试角色','all',id
     FROM public.roles WHERE code='company-super-admin'`,
    [roleId, person.orgId],
  );
  await f.pool.query(
    `INSERT INTO public.role_grants(role_id,app_code,feature_code,level,actions)
     SELECT $1,app_code,code,CASE WHEN app_code='system' AND code='number' THEN 'custom' ELSE 'none' END,
     CASE WHEN app_code='system' AND code='number' THEN $2::text[] ELSE NULL END FROM public.features`,
    [roleId, actions],
  );
  await f.pool.query("INSERT INTO public.identity_roles VALUES($1,$2)", [
    person.identityId,
    roleId,
  ]);
  return { ...person, roleId };
}
it("迁移重跑和预置初始化均幂等，查询预览不消耗编号，保留管理员配置", async () => {
  expect(await migratePublic(f.pool)).toEqual([]);
  const rows = await list();
  expect(rows).toHaveLength(6);
  expect(
    rows.every(
      (r) =>
        r.year === year &&
        r.currentValue === 0 &&
        r.digits === 6 &&
        r.reset === "yearly",
    ),
  ).toBe(true);
  const row = await rule();
  expect(
    (
      await f.request(`/number-rules/${row.id}`, "PATCH", {
        ...input(row),
        prefix: "JOB",
      })
    ).status,
  ).toBe(200);
  const before = await snapshot();
  await numbers.onModuleInit();
  await numbers.onModuleInit();
  await list();
  expect(await snapshot()).toEqual(before);
  expect((await rule()).nextNumber).toBe(`JOB-${year}-000001`);
});
it("两个服务实例并发取号1000次无重号，全部计数及登记恰好提交一次", async () => {
  const other = new NumbersService(new NumbersRepository(drizzle(f.pool)));
  const values = await Promise.all(
    Array.from({ length: 1000 }, (_, i) =>
      next("task", i % 2 ? numbers : other),
    ),
  );
  expect(new Set(values).size).toBe(1000);
  expect([...values].sort()).toEqual(
    Array.from(
      { length: 1000 },
      (_, i) => `RW-${year}-${String(i + 1).padStart(6, "0")}`,
    ),
  );
  expect(await rule()).toMatchObject({
    currentValue: 1000,
    version: 1000,
    nextNumber: `RW-${year}-001001`,
  });
  expect((await snapshot()).issues).toHaveLength(1000);
}, 30000);
it("不同对象分别计数，同一业务事务可以为多个对象取号", async () => {
  const values = await repository.transaction(async (tx) => [
    await numbers.next("task", tx),
    await numbers.next("todo", tx),
    await numbers.next("import", tx),
  ]);
  expect(values).toEqual([
    `RW-${year}-000001`,
    `DB-${year}-000001`,
    `DR-${year}-000001`,
  ]);
  expect((await rule("subscription")).currentValue).toBe(0);
});
it("业务失败和登记失败均整体回滚，计数、登记、业务数据不留下半成品", async () => {
  const before = await snapshot();
  await expect(
    repository.transaction(async (tx) => {
      const no = await numbers.next("task", tx);
      await tx.execute(
        sql`INSERT INTO public.number_test_documents(no) VALUES(${no})`,
      );
      throw new Error("业务写入失败");
    }),
  ).rejects.toThrow("业务写入失败");
  expect(await snapshot()).toEqual(before);
  expect(
    (await f.pool.query("SELECT * FROM public.number_test_documents")).rows,
  ).toEqual([]);
  const spy = vi
    .spyOn(repository, "register")
    .mockRejectedValueOnce(new Error("编号登记失败"));
  try {
    await expect(next()).rejects.toThrow("编号登记失败");
  } finally {
    spy.mockRestore();
  }
  expect(await snapshot()).toEqual(before);
  expect(await next()).toBe(`RW-${year}-000001`);
});
it("取得行锁后才读年度，上海时区独立于会话时区，每年及永不重置按规则执行", async () => {
  await f.pool.query(
    "UPDATE public.number_rules SET year=$1,current_value=44 WHERE type IN ('task','todo')",
    [year - 1],
  );
  await f.pool.query(
    "UPDATE public.number_rules SET reset='never' WHERE type='todo'",
  );
  expect(
    await repository.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL TIME ZONE 'America/Los_Angeles'`);
      return numbers.next("task", tx);
    }),
  ).toBe(`RW-${year}-000001`);
  expect(await next("todo")).toBe(`DB-${year}-000045`);
  const order: string[] = [],
    lock = repository.lockByType.bind(repository),
    clock = repository.year.bind(repository);
  const lockSpy = vi
    .spyOn(repository, "lockByType")
    .mockImplementation(async (...args) => {
      const row = await lock(...args);
      order.push("locked");
      return row;
    });
  const yearSpy = vi
    .spyOn(repository, "year")
    .mockImplementation(async (...args) => {
      order.push("clock");
      return clock(...args);
    });
  try {
    await next();
    expect(order).toEqual(["locked", "clock"]);
  } finally {
    lockSpy.mockRestore();
    yearSpy.mockRestore();
  }
});
it("未来年度和流水溢出均拒绝且不写状态，增加位数后可继续分配", async () => {
  await f.pool.query(
    "UPDATE public.number_rules SET year=$1 WHERE type='task'",
    [year + 1],
  );
  let before = await snapshot();
  await expect(next()).rejects.toMatchObject({ code: 30003 });
  expect((await rule()).nextNumber).toBeNull();
  expect(await snapshot()).toEqual(before);
  await f.pool.query(
    "UPDATE public.number_rules SET year=$1,digits=1,current_value=9 WHERE type='task'",
    [year],
  );
  before = await snapshot();
  await expect(next()).rejects.toMatchObject({ code: 30001 });
  expect((await rule()).nextNumber).toBeNull();
  expect(await snapshot()).toEqual(before);
  const row = await rule();
  expect(
    (
      await f.request(`/number-rules/${row.id}`, "PATCH", {
        ...input(row),
        digits: 2,
      })
    ).status,
  ).toBe(200);
  expect(await next()).toBe(`RW-${year}-10`);
});
it("修改格式不改变历史编号或回拨计数，缩短位数不能小于现有值", async () => {
  const first = await next(),
    row = await rule();
  const r = await f.request(`/number-rules/${row.id}`, "PATCH", {
    ...input(row),
    prefix: "JOB",
    digits: 4,
    reset: "never",
  });
  expect(r.status).toBe(200);
  expect(
    successResponseSchema(numberRuleSchema).parse(await r.json()).data,
  ).toMatchObject({
    prefix: "JOB",
    currentValue: 1,
    nextNumber: `JOB-${year}-0002`,
  });
  expect(await next()).toBe(`JOB-${year}-0002`);
  expect((await snapshot()).issues.map((i) => i.no)).toContain(first);
  await f.pool.query(
    "UPDATE public.number_rules SET current_value=123 WHERE type='task'",
  );
  const fresh = await rule(),
    before = await snapshot();
  expect(
    (
      await f.request(`/number-rules/${fresh.id}`, "PATCH", {
        ...input(fresh),
        digits: 2,
      })
    ).status,
  ).toBe(400);
  expect(await snapshot()).toEqual(before);
});
it("跨对象复用历史前缀及重建预置规则仍跳过已发号；前缀冲突不写审计", async () => {
  await next();
  let row = await rule(),
    before = await snapshot();
  const conflict = await f.request(`/number-rules/${row.id}`, "PATCH", {
    ...input(row),
    prefix: "DB",
  });
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({ code: 30002 });
  expect(await snapshot()).toEqual(before);
  expect(
    (
      await f.request(`/number-rules/${row.id}`, "PATCH", {
        ...input(row),
        prefix: "JOB",
      })
    ).status,
  ).toBe(200);
  row = await rule("todo");
  expect(
    (
      await f.request(`/number-rules/${row.id}`, "PATCH", {
        ...input(row),
        prefix: "RW",
      })
    ).status,
  ).toBe(200);
  expect(await next("todo")).toBe(`RW-${year}-000002`);
  await f.pool.query(
    "UPDATE public.number_rules SET deleted_at=now() WHERE type='todo'",
  );
  await numbers.onModuleInit();
  // 原始规则已软删，但其历史编号登记不可清除。
  row = await rule("todo");
  expect(
    (
      await f.request(`/number-rules/${row.id}`, "PATCH", {
        ...input(row),
        prefix: "RW",
      })
    ).status,
  ).toBe(200);
  expect(await next("todo")).toBe(`RW-${year}-000003`);
});
it("旧版本和同版本并发配置只允许一次成功，取号也使旧配置版本失效", async () => {
  const row = await rule();
  const results = await Promise.all(
    ["JOB", "TASK"].map((prefix) =>
      f.request(`/number-rules/${row.id}`, "PATCH", { ...input(row), prefix }),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(await results.find((r) => r.status === 409)?.json()).toMatchObject({
    code: 90002,
  });
  const old = await rule();
  await next();
  expect(
    (await f.request(`/number-rules/${old.id}`, "PATCH", input(old))).status,
  ).toBe(409);
  expect((await snapshot()).audits).toHaveLength(1);
});
it("只读、无权限及学校身份的真实接口能力正确，拒绝写入后数据不变", async () => {
  const readonly = await actor(["view"]),
    forbidden = await actor([]),
    school = await f.seed("school", "school-admin");
  expect(
    (await list(readonly.token)).every((r) => r.allowedActions.length === 0),
  ).toBe(true);
  const row = await rule(),
    before = await snapshot();
  for (const token of [readonly.token, forbidden.token, school.token]) {
    expect(
      (
        await f.request(
          `/number-rules/${row.id}`,
          "PATCH",
          { ...input(row), prefix: "JOB" },
          token,
        )
      ).status,
    ).toBe(403);
  }
  for (const token of [forbidden.token, school.token])
    expect(
      (await f.request("/number-rules", "GET", undefined, token)).status,
    ).toBe(403);
  expect(await snapshot()).toEqual(before);
});
it("真实角色编辑授权和撤权控制同一令牌的PATCH，拒绝时版本不变", async () => {
  const person = await actor(["view"]),
    row = await rule(),
    path = `/number-rules/${row.id}`;
  expect(
    (await f.request(path, "PATCH", input(row), person.token)).status,
  ).toBe(403);
  for (const [level, status] of [
    ["edit", 200],
    ["view", 403],
  ] as const) {
    const grants = roleInput(await f.detail(person.roleId));
    grants.grants = grants.grants.map((g) =>
      g.app === "system" && g.feature === "number"
        ? { ...g, grant: { level } }
        : g,
    );
    expect(
      (await f.request(`/roles/${person.roleId}/grants`, "PUT", grants)).status,
    ).toBe(200);
    const fresh = await rule(),
      before = await snapshot();
    expect(
      (
        await f.request(
          path,
          "PATCH",
          { ...input(fresh), prefix: "JOB" },
          person.token,
        )
      ).status,
    ).toBe(status);
    if (status === 403) expect(await snapshot()).toEqual(before);
  }
});
it("排队期间撤回写权限，锁内重读权限并拒绝配置；审计失败整体回滚", async () => {
  const person = await actor(["view", "update"]),
    row = await rule();
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
  const before = await snapshot();
  try {
    const pending = f.request(
      `/number-rules/${row.id}`,
      "PATCH",
      { ...input(row), prefix: "JOB" },
      person.token,
    );
    await ready;
    await f.pool.query(
      "UPDATE public.role_grants SET actions=ARRAY['view'] WHERE role_id=$1 AND app_code='system' AND feature_code='number'",
      [person.roleId],
    );
    release();
    expect((await pending).status).toBe(403);
  } finally {
    release();
    spy.mockRestore();
  }
  expect(await snapshot()).toEqual(before);
  const audit = vi
    .spyOn(repository, "audit")
    .mockRejectedValueOnce(new Error("审计写入失败"));
  try {
    expect(
      (
        await f.request(`/number-rules/${row.id}`, "PATCH", {
          ...input(row),
          prefix: "JOB",
        })
      ).status,
    ).toBe(500);
  } finally {
    audit.mockRestore();
  }
  expect(await snapshot()).toEqual(before);
});
it("请求严格校验、无令牌401、未知及软删规则404，无公开取号或删规则入口", async () => {
  const row = await rule(),
    before = await snapshot();
  expect((await fetch(`${f.base}/api/v1/number-rules`)).status).toBe(401);
  expect(
    (await f.request("/number-rules", "GET", undefined, f.admin.account))
      .status,
  ).toBe(401);
  for (const payload of [
    { ...input(row), currentValue: 0 },
    { ...input(row), year: year + 1 },
    { ...input(row), version: undefined },
    { ...input(row), digits: 13 },
    { ...input(row), prefix: "rw" },
  ])
    expect(
      (await f.request(`/number-rules/${row.id}`, "PATCH", payload)).status,
    ).toBe(400);
  expect((await f.request("/number-rules?schoolId=x")).status).toBe(400);
  expect(
    (await f.request(`/number-rules/${v7()}`, "PATCH", input(row))).status,
  ).toBe(404);
  expect(
    (await f.request("/number-rules/invalid", "PATCH", input(row))).status,
  ).toBe(400);
  expect((await f.request("/number-rules/next", "POST", {})).status).toBe(404);
  expect(
    (await f.request(`/number-rules/${row.id}`, "DELETE", { version: 0 }))
      .status,
  ).toBe(404);
  expect(await snapshot()).toEqual(before);
  await f.pool.query(
    "UPDATE public.number_rules SET deleted_at=now() WHERE id=$1",
    [row.id],
  );
  expect(
    (await f.request(`/number-rules/${row.id}`, "PATCH", input(row))).status,
  ).toBe(404);
  await expect(next()).rejects.toMatchObject({ code: 90004 });
});
it("数据库独立保护编号唯一、前缀唯一和数值边界", async () => {
  await next();
  await expect(
    f.pool.query(
      "INSERT INTO public.number_issues SELECT $1,rule_id,prefix,year,value,no,created_at FROM public.number_issues LIMIT 1",
      [v7()],
    ),
  ).rejects.toMatchObject({ code: "23505" });
  await expect(
    f.pool.query(
      "UPDATE public.number_rules SET prefix='RW' WHERE type='todo'",
    ),
  ).rejects.toMatchObject({ code: "23505" });
  for (const patch of [
    "digits=0",
    "digits=13",
    "current_value=-1",
    "current_value=1000000000000",
    "year=0",
    "reset='monthly'",
  ])
    await expect(
      f.pool.query(`UPDATE public.number_rules SET ${patch} WHERE type='task'`),
    ).rejects.toMatchObject({ code: "23514" });
});

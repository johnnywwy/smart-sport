import { setTimeout as delay } from "node:timers/promises";
import type { WorkerConfig } from "@smart-sport/config/env";
import {
  apiResponseSchema,
  availableModulesSchema,
  moduleMenusSchema,
  schoolAppsSchema,
  schoolProfileSchema,
  subscriptionDetailSchema,
  subscriptionsSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import {
  calendarDays,
  shanghaiDate,
  shanghaiInstant,
} from "@smart-sport/domain";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  SubscriptionStatusWorker,
  subscriptionStatusQueue,
} from "../../../worker/dist/subscription-status-worker.js";
import { migrateOutbox } from "../../src/database/migrate-outbox.js";
import { DataSourceRegistry } from "../../src/database/registry.js";
import { IdentityContextService } from "../../src/modules/platform/identity-context/index.js";
import {
  createSubscriptionLifecycle,
  SubscriptionRepository,
  SubscriptionStateService,
} from "../../src/modules/platform/subscription/index.js";
import { schoolProfileFixture } from "../helpers/school-profiles.js";

let f: Awaited<ReturnType<typeof schoolProfileFixture>>;
let sources: DataSourceRegistry;
let lifecycle: ReturnType<typeof createSubscriptionLifecycle>;
const workers: SubscriptionStatusWorker[] = [];
const today = () => shanghaiDate(new Date());
beforeAll(async () => {
  f = await schoolProfileFixture();
  const connectionString = f.pool.options.connectionString;
  if (!connectionString) throw new Error("缺少测试数据库");
  sources = new DataSourceRegistry({
    DATABASE_URL: connectionString,
    EXTRA_DATASOURCES: {},
  });
  await migrateOutbox(f.pool);
  lifecycle = createSubscriptionLifecycle(sources);
}, 120000);
afterAll(async () => {
  for (const worker of workers) await worker.beforeApplicationShutdown();
  await sources?.onApplicationShutdown();
  await f?.stop();
}, 30000);
async function period(
  id: string,
  days: number,
  graceDays = 2,
  contractNo: string | null = "合同测试",
) {
  await f.pool.query(
    "UPDATE public.school_subscriptions SET service_start=$2,service_end=$3,grace_days=$4,contract_no=$5 WHERE school_id=$1",
    [
      id,
      shanghaiInstant(calendarDays(today(), -30)),
      shanghaiInstant(calendarDays(today(), days)),
      graceDays,
      contractNo,
    ],
  );
  await f.pool.query(
    "UPDATE public.school_apps SET start_date=$2,end_date=$3 WHERE school_id=$1",
    [
      id,
      shanghaiInstant(calendarDays(today(), -30)),
      shanghaiInstant(calendarDays(today(), days)),
    ],
  );
}
async function ownSchool() {
  const profile = await f.profile();
  const admin = await f.seed("school", "school-admin", profile.id);
  return { profile, admin };
}
async function row(id: string) {
  return (
    await f.pool.query(
      "SELECT * FROM public.school_subscriptions WHERE school_id=$1 AND deleted_at IS NULL",
      [id],
    )
  ).rows[0];
}
async function apps(id: string, token: string) {
  const response = await f.request(
    `/schools/${id}/apps`,
    "GET",
    undefined,
    token,
  );
  expect(response.status).toBe(200);
  return successResponseSchema(schoolAppsSchema).parse(await response.json())
    .data;
}
it("服务列表、详情和学校应用成功，账号级401、无功能403、越校404", async () => {
  const { profile, admin } = await ownSchool();
  const list = await f.request("/subscriptions");
  expect(list.status).toBe(200);
  expect(
    successResponseSchema(subscriptionsSchema)
      .parse(await list.json())
      .data.items.some((item) => item.schoolId === profile.id),
  ).toBe(true);
  const detail = await f.request(`/subscriptions/${profile.id}`);
  expect(detail.status).toBe(200);
  expect(
    successResponseSchema(subscriptionDetailSchema)
      .parse(await detail.json())
      .data.apps.map((item) => item.code),
  ).toEqual(["org", "school"]);
  expect((await apps(profile.id, admin.token)).accessMode).toBe("full");
  const another = await ownSchool();
  expect(
    (
      await f.request(
        `/schools/${profile.id}/apps`,
        "GET",
        undefined,
        another.admin.token,
      )
    ).status,
  ).toBe(404);
  const empty = await f.seed("company", null);
  for (const path of ["/subscriptions", `/subscriptions/${profile.id}`]) {
    expect((await f.request(path, "GET", undefined, empty.token)).status).toBe(
      403,
    );
    expect(
      (await f.request(path, "GET", undefined, f.admin.account)).status,
    ).toBe(401);
  }
  expect(
    (
      await f.request(
        `/schools/${profile.id}/apps`,
        "GET",
        undefined,
        empty.token,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await f.request(
        `/schools/${profile.id}/apps`,
        "GET",
        undefined,
        f.admin.account,
      )
    ).status,
  ).toBe(401);
  expect((await f.request(`/subscriptions/${v7()}`)).status).toBe(404);
});
it("服务列表按动作范围隔离，销售本人负责只见负责学校且到期排序筛选稳定", async () => {
  const a = await ownSchool(),
    b = await ownSchool();
  await period(a.profile.id, 3);
  await period(b.profile.id, 1);
  const sales = await f.seed("company", "company-sales", f.admin.orgId);
  const department = await f.department();
  await f.assign(sales.identityId, department.id);
  await f.personal(sales.identityId, "school", a.profile.id);
  await f.pool.query(
    "UPDATE public.school_subscriptions SET sales_identity_id=$2 WHERE school_id=$1",
    [a.profile.id, sales.identityId],
  );
  const response = await f.request(
    "/subscriptions?expiringInDays=7",
    "GET",
    undefined,
    sales.token,
  );
  expect(response.status).toBe(200);
  const result = successResponseSchema(subscriptionsSchema).parse(
    await response.json(),
  ).data;
  expect(result.items.map((item) => item.schoolId)).toEqual([a.profile.id]);
  expect(result.items[0]?.salesName).toBe("角色测试");
  expect(
    (
      await f.request(
        `/subscriptions/${b.profile.id}`,
        "GET",
        undefined,
        sales.token,
      )
    ).status,
  ).toBe(404);
  const scoped = await f.request("/subscriptions?expiringInDays=7&pageSize=1");
  const first = successResponseSchema(subscriptionsSchema).parse(
    await scoped.json(),
  ).data;
  expect(first.items[0]?.schoolId).toBe(b.profile.id);
  expect((await f.request("/subscriptions?expiringInDays=-1")).status).toBe(
    400,
  );
});
it("同一学校令牌不重登：宽限期档案可读、不能修改，菜单保留；试用和合同均适用", async () => {
  const { profile, admin } = await ownSchool();
  for (const contract of [null, "合同测试"]) {
    await period(profile.id, -1, 2, contract);
    const info = await apps(profile.id, admin.token);
    expect(info.status).toBe("grace");
    expect(info.accessMode).toBe("readonly");
    const read = await f.request(
      `/schools/${profile.id}/profile`,
      "GET",
      undefined,
      admin.token,
    );
    expect(read.status).toBe(200);
    expect(
      successResponseSchema(schoolProfileSchema).parse(await read.json()).data
        .allowedActions,
    ).toEqual([]);
    const write = await f.request(
      `/schools/${profile.id}/profile`,
      "PATCH",
      profile.patch,
      admin.token,
    );
    expect(write.status).toBe(403);
    expect(apiResponseSchema.parse(await write.json()).code).toBe(13002);
    const groups = await f.request(
      "/menus/current?module=base",
      "GET",
      undefined,
      admin.token,
    );
    expect(groups.status).toBe(200);
    expect(
      successResponseSchema(moduleMenusSchema)
        .parse(await groups.json())
        .data.flatMap((g: { children: { key: string }[] }) => g.children)
        .some((item: { key: string }) => item.key === "students"),
    ).toBe(true);
    const context = await f.app
      .get(IdentityContextService)
      .load(admin.identityId);
    await expect(
      f.app
        .get(SubscriptionStateService)
        .requireAccess(profile.id, "school:student:export", context),
    ).resolves.toBeUndefined();
  }
  const stored = await f.pool.query(
    "SELECT version FROM public.school_profiles WHERE school_id=$1",
    [profile.id],
  );
  expect(stored.rows[0]?.version).toBe(0);
});
it("公司进入到期学校同样只读，未开通应用不显示且不能借菜单绕过接口", async () => {
  const { profile, admin } = await ownSchool();
  await period(profile.id, -1);
  const write = await f.request(
    `/schools/${profile.id}/profile`,
    "PATCH",
    profile.patch,
  );
  expect(write.status).toBe(403);
  expect(apiResponseSchema.parse(await write.json()).code).toBe(13002);
  await f.pool.query(
    "UPDATE public.school_apps SET deleted_at=now() WHERE school_id=$1 AND app_code='school'",
    [profile.id],
  );
  const groups = await f.request(
    "/menus/current?module=base",
    "GET",
    undefined,
    admin.token,
  );
  expect(
    successResponseSchema(moduleMenusSchema)
      .parse(await groups.json())
      .data.flatMap((g: { children: { key: string }[] }) => g.children)
      .some((item: { key: string }) => item.key === "students"),
  ).toBe(false);
  const read = await f.request(
    `/schools/${profile.id}/profile`,
    "GET",
    undefined,
    admin.token,
  );
  expect(read.status).toBe(403);
  expect(apiResponseSchema.parse(await read.json()).code).toBe(13001);
  await f.pool.query(
    "UPDATE public.school_apps SET deleted_at=now() WHERE school_id=$1",
    [profile.id],
  );
  const modules = await f.request(
    "/modules/available",
    "GET",
    undefined,
    admin.token,
  );
  expect(
    successResponseSchema(availableModulesSchema).parse(await modules.json())
      .data,
  ).toEqual([]);
  const companyModules = await f.request("/modules/available");
  expect(
    successResponseSchema(availableModulesSchema).parse(
      await companyModules.json(),
    ).data.length,
  ).toBeGreaterThan(0);
});
it("停用后同一管理员只保留导出，教师与非管理员业务入口被拒，跨校仍404", async () => {
  const { profile, admin } = await ownSchool();
  await period(profile.id, -3, 2);
  const info = await apps(profile.id, admin.token);
  expect(info).toMatchObject({ status: "suspended", accessMode: "export" });
  const context = await f.app
    .get(IdentityContextService)
    .load(admin.identityId);
  const state = f.app.get(SubscriptionStateService);
  await expect(
    state.requireAccess(profile.id, "school:student:export", context),
  ).resolves.toBeUndefined();
  await expect(
    state.requireAccess(profile.id, "school:student:view", context),
  ).rejects.toMatchObject({ code: 13003 });
  const teacher = await f.seed("school", null, profile.id);
  await f.pool.query(
    "UPDATE public.identities SET type='teacher' WHERE id=$1",
    [teacher.identityId],
  );
  await f.pool.query(
    "INSERT INTO public.identity_roles SELECT $1,id FROM public.roles WHERE code='teacher-pe'",
    [teacher.identityId],
  );
  const denied = await f.request(
    "/modules/available",
    "GET",
    undefined,
    teacher.token,
  );
  expect(denied.status).toBe(403);
  expect(apiResponseSchema.parse(await denied.json()).code).toBe(13003);
  const nonadmin = await f.seed("school", null, profile.id);
  expect(
    (await f.request("/modules/available", "GET", undefined, nonadmin.token))
      .status,
  ).toBe(403);
  expect(
    (await f.request(`/schools/${v7()}/apps`, "GET", undefined, admin.token))
      .status,
  ).toBe(404);
  expect((await f.request(`/schools/${profile.id}/profile`)).status).toBe(403);
  const groups = await f.request(
    "/menus/current?module=base",
    "GET",
    undefined,
    admin.token,
  );
  expect(groups.status).toBe(200);
  const keys = successResponseSchema(moduleMenusSchema)
    .parse(await groups.json())
    .data.flatMap((g: { children: { key: string }[] }) => g.children)
    .map((item: { key: string }) => item.key);
  expect(keys).toContain("students");
  expect(keys).not.toContain("departments");
});
it("内部开通读取默认参数、原子创建基础应用历史事件；回滚不留下服务或编号", async () => {
  const id = await f.school();
  await f.pool.query("DELETE FROM public.school_apps WHERE school_id=$1", [id]);
  await f.pool.query(
    "DELETE FROM public.school_subscriptions WHERE school_id=$1",
    [id],
  );
  const repository = f.app.get(SubscriptionRepository);
  const original = await f.pool.query(
    "SELECT count(*)::int n FROM public.number_issues",
  );
  await expect(
    repository.transaction(async (tx) => {
      await lifecycle.initialize(tx, { schoolId: id }, f.admin.identityId);
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect(await row(id)).toBeUndefined();
  expect(
    (await f.pool.query("SELECT count(*)::int n FROM public.number_issues"))
      .rows,
  ).toEqual(original.rows);
  const saved = await repository.transaction((tx) =>
    lifecycle.initialize(tx, { schoolId: id }, f.admin.identityId),
  );
  expect(saved.status).toBe("trial");
  expect(saved.graceDays).toBe(30);
  expect(shanghaiDate(saved.serviceEnd)).toBe(calendarDays(today(), 29));
  expect(
    (
      await f.pool.query(
        "SELECT action FROM public.school_subscription_logs WHERE school_id=$1",
        [id],
      )
    ).rows,
  ).toEqual([{ action: "initialize" }]);
  expect(
    (
      await f.pool.query(
        "SELECT topic FROM public.outbox_events WHERE school_id=$1",
        [id],
      )
    ).rows,
  ).toEqual([{ topic: "subscription.changed" }]);
  expect(
    (
      await f.pool.query(
        "SELECT count(*)::int n FROM public.school_apps WHERE school_id=$1",
        [id],
      )
    ).rows[0]?.n,
  ).toBe(2);
  await expect(
    repository.transaction((tx) =>
      lifecycle.initialize(tx, { schoolId: id }, f.admin.identityId),
    ),
  ).rejects.toMatchObject({ code: 90002 });
});
it("20个重算竞争只更新一次，同事务历史审计outbox；再次执行无副作用", async () => {
  const { profile } = await ownSchool();
  await period(profile.id, -1);
  const before = await row(profile.id);
  const result = await Promise.all(
    Array.from({ length: 20 }, () => lifecycle.reconcileSchool(profile.id)),
  );
  expect(result.filter(Boolean)).toHaveLength(1);
  expect((await row(profile.id)).version).toBe(before.version + 1);
  expect(
    (
      await f.pool.query(
        "SELECT count(*)::int n FROM public.school_subscription_logs WHERE school_id=$1",
        [profile.id],
      )
    ).rows[0]?.n,
  ).toBe(1);
  expect(
    (
      await f.pool.query(
        "SELECT count(*)::int n FROM public.audit_logs WHERE school_id=$1 AND action='subscription.status_changed'",
        [profile.id],
      )
    ).rows[0]?.n,
  ).toBe(1);
  expect(
    (
      await f.pool.query(
        "SELECT payload FROM public.outbox_events WHERE school_id=$1",
        [profile.id],
      )
    ).rows,
  ).toEqual([
    { payload: { recordId: before.id, version: before.version + 1 } },
  ]);
  expect(await lifecycle.reconcileSchool(profile.id)).toBe(false);
});
it("每日状态失败一校不阻断其他校，事件写失败使状态、审计和历史回滚", async () => {
  const a = await ownSchool(),
    b = await ownSchool();
  await period(a.profile.id, -1);
  await period(b.profile.id, -4);
  await f.pool.query(
    `CREATE FUNCTION public.fail_subscription_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.school_id='${a.profile.id}'::uuid THEN RAISE EXCEPTION 'test'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_subscription_event BEFORE INSERT ON public.outbox_events FOR EACH ROW EXECUTE FUNCTION public.fail_subscription_event()`,
  );
  const failed: string[] = [];
  try {
    const result = await lifecycle.reconcileAll((id) => failed.push(id));
    expect(result.failed).toBe(1);
    expect(failed).toEqual([a.profile.id]);
    expect((await row(a.profile.id)).status).toBe("active");
    expect((await row(b.profile.id)).status).toBe("suspended");
    expect(
      (
        await f.pool.query(
          "SELECT count(*)::int n FROM public.school_subscription_logs WHERE school_id=$1",
          [a.profile.id],
        )
      ).rows[0]?.n,
    ).toBe(0);
    expect(
      (
        await f.pool.query(
          "SELECT count(*)::int n FROM public.audit_logs WHERE school_id=$1 AND action='subscription.status_changed'",
          [a.profile.id],
        )
      ).rows[0]?.n,
    ).toBe(0);
  } finally {
    await f.pool.query(
      "DROP TRIGGER fail_subscription_event ON public.outbox_events; DROP FUNCTION public.fail_subscription_event()",
    );
  }
  expect(await lifecycle.reconcileSchool(a.profile.id)).toBe(true);
});
it("真实worker启动补算并登记上海01:00调度，队列再次执行不重复记录", async () => {
  const { profile } = await ownSchool();
  await period(profile.id, -1);
  const database = {
    DATABASE_URL: f.pool.options.connectionString ?? "",
    EXTRA_DATASOURCES: {},
  };
  const config = {
    ...f.config,
    WORKER_QUEUE_PREFIX: `subscription-test-${Date.now()}`,
  } as unknown as WorkerConfig;
  const worker = new SubscriptionStatusWorker(config, database);
  workers.push(worker);
  await worker.start();
  expect((await row(profile.id)).status).toBe("grace");
  const connection = new Redis(f.config.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  const queue = new Queue(subscriptionStatusQueue, {
    connection,
    prefix: config.WORKER_QUEUE_PREFIX,
  });
  try {
    const scheduler = await queue.getJobScheduler("daily-shanghai-0100");
    expect(scheduler).toMatchObject({
      tz: "Asia/Shanghai",
      pattern: "0 0 1 * * *",
    });
    const job = await queue.add("test-reconcile", {});
    let completed = false;
    for (let i = 0; i < 100; i++) {
      if ((await job.getState()) === "completed") {
        completed = true;
        break;
      }
      await delay(50);
    }
    expect(completed).toBe(true);
    expect(
      (
        await f.pool.query(
          "SELECT count(*)::int n FROM public.school_subscription_logs WHERE school_id=$1",
          [profile.id],
        )
      ).rows[0]?.n,
    ).toBe(1);
  } finally {
    await queue.close();
    connection.disconnect();
  }
});
it("未开通不自动续期，零宽限到期立即停用，未来服务不能提前使用", async () => {
  const a = await ownSchool();
  await period(a.profile.id, -1, 0);
  expect((await apps(a.profile.id, a.admin.token)).status).toBe("suspended");
  await f.pool.query(
    "UPDATE public.school_subscriptions SET service_start=$2,service_end=$3 WHERE school_id=$1",
    [
      a.profile.id,
      shanghaiInstant(calendarDays(today(), 1)),
      shanghaiInstant(calendarDays(today(), 30)),
    ],
  );
  expect(
    (await f.request("/modules/available", "GET", undefined, a.admin.token))
      .status,
  ).toBe(403);
  await f.pool.query("DELETE FROM public.school_apps WHERE school_id=$1", [
    a.profile.id,
  ]);
  await f.pool.query(
    "DELETE FROM public.school_subscriptions WHERE school_id=$1",
    [a.profile.id],
  );
  const info = await apps(a.profile.id, f.admin.token);
  expect(info).toMatchObject({
    status: "suspended",
    serviceEnd: null,
    accessMode: "unavailable",
    apps: [],
  });
  const denied = await f.request(`/schools/${a.profile.id}/profile`);
  expect(denied.status).toBe(403);
  expect(apiResponseSchema.parse(await denied.json()).code).toBe(13003);
  expect(await row(a.profile.id)).toBeUndefined();
});
it("默认参数只影响新服务，不改已开通服务的期限；合同缺少服务期拒绝", async () => {
  const id = await f.school();
  await f.pool.query("DELETE FROM public.school_apps WHERE school_id=$1", [id]);
  await f.pool.query(
    "DELETE FROM public.school_subscriptions WHERE school_id=$1",
    [id],
  );
  const repository = f.app.get(SubscriptionRepository);
  await f.pool.query(
    "UPDATE public.sys_params SET value=CASE WHEN key='subscription.trial_days' THEN '5'::jsonb ELSE '7'::jsonb END WHERE key IN ('subscription.trial_days','subscription.grace_days')",
  );
  try {
    await expect(
      repository.transaction((tx) =>
        lifecycle.initialize(
          tx,
          { schoolId: id, contractNo: "合同缺日期" },
          f.admin.identityId,
        ),
      ),
    ).rejects.toMatchObject({ code: 90001 });
    const saved = await repository.transaction((tx) =>
      lifecycle.initialize(tx, { schoolId: id }, f.admin.identityId),
    );
    expect(saved.graceDays).toBe(7);
    expect(shanghaiDate(saved.serviceEnd)).toBe(calendarDays(today(), 4));
    await f.pool.query(
      "UPDATE public.sys_params SET value='20'::jsonb WHERE key IN ('subscription.trial_days','subscription.grace_days')",
    );
    await lifecycle.reconcileSchool(id);
    const existing = await row(id);
    expect(existing.grace_days).toBe(7);
    expect(shanghaiDate(existing.service_end)).toBe(calendarDays(today(), 4));
  } finally {
    await f.pool.query(
      "UPDATE public.sys_params SET value='30'::jsonb WHERE key IN ('subscription.trial_days','subscription.grace_days')",
    );
  }
});

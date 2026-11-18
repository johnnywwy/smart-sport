import {
  successResponseSchema,
  type Task,
  type TaskType,
  taskListSchema,
  taskSchema,
} from "@smart-sport/contracts";
import { sql } from "drizzle-orm";
import { v7 } from "uuid";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { migratePublic } from "../../src/database/migrate.js";
import { AccessTokenSigner } from "../../src/infra/auth/access-token-signer.js";
import {
  TaskExecutionService,
  TasksRepository,
  TasksService,
} from "../../src/modules/foundation/tasks/index.js";
import { IdentityContextService } from "../../src/modules/platform/identity-context/index.js";
import { roleManagementFixture } from "../helpers/role-management.js";

let f: Awaited<ReturnType<typeof roleManagementFixture>>;
let tasks: TasksService,
  runner: TaskExecutionService,
  repository: TasksRepository,
  contexts: IdentityContextService;
beforeAll(async () => {
  f = await roleManagementFixture();
  tasks = f.app.get(TasksService);
  runner = f.app.get(TaskExecutionService);
  repository = f.app.get(TasksRepository);
  contexts = f.app.get(IdentityContextService);
}, 120000);
afterAll(async () => {
  await f?.stop();
}, 30000);
beforeEach(async () => {
  await f.pool.query("DELETE FROM public.tasks");
});
async function create(
  type: TaskType = "import",
  owner = f.admin,
  schoolId: string | null = null,
) {
  return tasks.create(await contexts.load(owner.identityId), {
    type,
    schoolId,
    summary: { total: 100 },
  });
}
async function detail(id: string, token = f.admin.token) {
  const response = await f.request(`/tasks/${id}`, "GET", undefined, token);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return successResponseSchema(taskSchema).parse(await response.json()).data;
}
async function list(query = "", token = f.admin.token) {
  const response = await f.request(`/tasks${query}`, "GET", undefined, token);
  expect(response.status).toBe(200);
  return successResponseSchema(taskListSchema).parse(await response.json())
    .data;
}
const cancel = (row: Task, token = f.admin.token) =>
  f.request(`/tasks/${row.id}/cancel`, "POST", { version: row.version }, token);
it("迁移重跑幂等，内部创建原子分配RW编号，公共字段和初始状态正确", async () => {
  expect(await migratePublic(f.pool)).toEqual([]);
  const [first, second] = await Promise.all([create(), create("export")]);
  expect(first.no).toMatch(/^RW-\d{4}-\d{6}$/);
  expect(first.no).not.toBe(second.no);
  expect(await detail(first.id)).toEqual(first);
  expect(first).toMatchObject({
    status: "queued",
    progress: 0,
    version: 0,
    allowedActions: ["cancel"],
    startedAt: null,
    finishedAt: null,
  });
  const db = (
    await f.pool.query("SELECT * FROM public.tasks WHERE id=$1", [first.id])
  ).rows[0];
  expect(db.identity_id).toBe(f.admin.identityId);
  expect(db.created_by).toBe(f.admin.identityId);
});
it("业务事务或任务写入失败时，编号登记、计数与任务一起回滚", async () => {
  const before = (
    await f.pool.query(
      "SELECT current_value,version FROM public.number_rules WHERE type='task'",
    )
  ).rows;
  const actor = await contexts.load(f.admin.identityId);
  await expect(
    repository.transaction(async (tx) => {
      await tasks.create(actor, { type: "import", schoolId: null }, tx);
      throw new Error("业务失败");
    }),
  ).rejects.toThrow("业务失败");
  const spy = vi
    .spyOn(repository, "create")
    .mockRejectedValueOnce(new Error("写任务失败"));
  try {
    await expect(create()).rejects.toThrow("写任务失败");
  } finally {
    spy.mockRestore();
  }
  expect((await list()).total).toBe(0);
  expect(
    (
      await f.pool.query(
        "SELECT current_value,version FROM public.number_rules WHERE type='task'",
      )
    ).rows,
  ).toEqual(before);
});
it("分页与状态筛选正确，进行中计数不随筛选/页码改变", async () => {
  const a = await create(),
    b = await create("export"),
    c = await create();
  const begun = await runner.transition(b.id, b.version, { action: "start" });
  await runner.transition(b.id, begun.version, {
    action: "finish",
    status: "succeeded",
    summary: { processed: 100, succeeded: 100 },
  });
  const page = await list("?page=1&pageSize=1&mine=true");
  expect(page.total).toBe(3);
  expect(page.activeCount).toBe(2);
  expect(page.items.map((r) => r.id)).toEqual([c.id]);
  expect((await list("?page=2&pageSize=1")).items.map((r) => r.id)).toEqual([
    b.id,
  ]);
  expect(await list("?status=succeeded")).toMatchObject({
    total: 1,
    activeCount: 2,
  });
  expect(await list("?status=active&page=99")).toMatchObject({
    total: 2,
    activeCount: 2,
    items: [],
  });
  expect((await list("?status=queued")).items.map((r) => r.id)).toEqual([
    c.id,
    a.id,
  ]);
});
it("取消排队任务直接终止，旧版本和重复取消均不重复写入", async () => {
  const task = await create();
  expect((await cancel(task)).status).toBe(200);
  const cancelled = await detail(task.id);
  expect(cancelled).toMatchObject({
    status: "cancelled",
    progress: 0,
    version: 1,
    allowedActions: [],
  });
  expect(cancelled.cancelRequestedAt).not.toBeNull();
  expect(cancelled.finishedAt).not.toBeNull();
  expect((await list()).activeCount).toBe(0);
  expect(await (await cancel(task)).json()).toMatchObject({ code: 90002 });
  expect(await (await cancel(cancelled)).json()).toMatchObject({ code: 30020 });
  await expect(
    runner.transition(task.id, 1, { action: "start" }),
  ).rejects.toMatchObject({ code: 30020 });
  expect(await detail(task.id)).toEqual(cancelled);
});
it("运行中取消保留数据和进度，worker安全节点确认后才退出进行中计数", async () => {
  let task = await create();
  task = await runner.transition(task.id, task.version, { action: "start" });
  task = await runner.transition(task.id, task.version, {
    action: "progress",
    progress: 40,
    summary: { processed: 40, succeeded: 39, failed: 1 },
  });
  expect((await cancel(task)).status).toBe(200);
  let cancelling = await detail(task.id);
  expect(cancelling).toMatchObject({
    status: "running",
    progress: 40,
    finishedAt: null,
    allowedActions: [],
  });
  expect(cancelling.cancelRequestedAt).not.toBeNull();
  expect((await list()).activeCount).toBe(1);
  await expect(
    runner.transition(task.id, task.version, {
      action: "finish",
      status: "succeeded",
      summary: {},
    }),
  ).rejects.toMatchObject({ code: 90002 });
  await expect(
    runner.transition(task.id, cancelling.version, {
      action: "finish",
      status: "succeeded",
      summary: {},
    }),
  ).rejects.toMatchObject({ code: 30020 });
  // 在途批次允许持新版本补报已提交的数量，不能清除取消申请。
  cancelling = await runner.transition(task.id, cancelling.version, {
    action: "progress",
    progress: 41,
    summary: { processed: 41, succeeded: 40 },
  });
  const stopped = await runner.transition(task.id, cancelling.version, {
    action: "acknowledgeCancel",
  });
  expect(stopped).toMatchObject({
    status: "cancelled",
    progress: 41,
    summary: { processed: 41, succeeded: 40, failed: 1 },
  });
  expect(stopped.cancelRequestedAt).toBe(cancelling.cancelRequestedAt);
  expect((await list()).activeCount).toBe(0);
});
it("结构变更类开始后不可取消，返回30021且allowedActions一致", async () => {
  for (const type of ["provision", "rollover", "tenant_export"] as const) {
    const task = await create(type);
    expect(task.allowedActions).toEqual(["cancel"]);
    const running = await runner.transition(task.id, 0, { action: "start" });
    expect(running.allowedActions).toEqual([]);
    expect(await (await cancel(running)).json()).toMatchObject({ code: 30021 });
    expect(await detail(task.id)).toEqual(running);
  }
});
it("成功、部分成功、失败各自收口；失败返回固定文案，终态拒绝重开", async () => {
  for (const status of ["succeeded", "partial", "failed"] as const) {
    let task = await create();
    task = await runner.transition(task.id, 0, { action: "start" });
    task = await runner.transition(task.id, task.version, {
      action: "progress",
      progress: 45,
      summary: { processed: 45 },
    });
    task = await runner.transition(
      task.id,
      task.version,
      status === "failed"
        ? { action: "fail" }
        : { action: "finish", status, summary: { processed: 100 } },
    );
    expect(task.progress).toBe(status === "failed" ? 45 : 100);
    expect(task.error).toBe(
      status === "failed" ? "任务执行失败，请重试或联系管理员" : null,
    );
    expect(task.finishedAt).not.toBeNull();
    expect(task.allowedActions).toEqual([]);
    expect(await detail(task.id)).toEqual(task);
    await expect(
      runner.transition(task.id, task.version, { action: "start" }),
    ).rejects.toMatchObject({ code: 30020 });
  }
});
it("同版本取消和抢占并发只有一次成功，不能启动已取消任务", async () => {
  for (let i = 0; i < 10; i++) {
    const task = await create();
    const results = await Promise.allSettled([
      runner.transition(task.id, 0, { action: "start" }),
      tasks.cancel(await contexts.load(f.admin.identityId), task.id, {
        version: 0,
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: 90002 },
    });
    expect((await detail(task.id)).version).toBe(1);
  }
});
it("重复消费者与同时进度更新用版本互斥，不覆盖彼此", async () => {
  const task = await create();
  const starts = await Promise.allSettled([
    runner.transition(task.id, 0, { action: "start" }),
    runner.transition(task.id, 0, { action: "start" }),
  ]);
  expect(starts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const updates = await Promise.allSettled(
    [20, 40].map((progress) =>
      runner.transition(task.id, 1, {
        action: "progress",
        progress,
        summary: { processed: progress },
      }),
    ),
  );
  expect(updates.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(updates.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: 90002 },
  });
  const checkpoint = await runner.checkpoint(task.id);
  expect(checkpoint.version).toBe(2);
  await expect(
    runner.transition(task.id, 2, {
      action: "progress",
      progress: 1,
      summary: {},
    }),
  ).rejects.toMatchObject({ code: 90001 });
  expect(await detail(task.id)).toEqual(checkpoint);
});
it("内部进度可以加入业务事务，业务失败则任务进度不单独提交", async () => {
  const task = await create();
  const begun = await runner.transition(task.id, 0, { action: "start" });
  await expect(
    repository.transaction(async (tx) => {
      await runner.transition(
        task.id,
        begun.version,
        { action: "progress", progress: 50, summary: { processed: 50 } },
        tx,
      );
      throw new Error("批次提交失败");
    }),
  ).rejects.toThrow("批次提交失败");
  expect(await detail(task.id)).toEqual(begun);
});
it("本人身份全局能力无需角色；同组织、跨组织、跨校包括超管都不可代查", async () => {
  const plain = await f.seed("company", null, f.admin.orgId);
  const school = await f.seed("school", "school-admin"),
    foreign = await f.seed("school", "school-admin");
  const own = await create("import", plain),
    a = await create("import", school, school.orgId),
    b = await create("export", foreign, foreign.orgId);
  expect((await list("", plain.token)).items.map((r) => r.id)).toEqual([
    own.id,
  ]);
  expect((await detail(a.id, school.token)).schoolId).toBe(school.orgId);
  for (const [id, token] of [
    [own.id, f.admin.token],
    [a.id, foreign.token],
    [b.id, school.token],
    [a.id, f.admin.token],
  ]) {
    expect(
      (await f.request(`/tasks/${id}`, "GET", undefined, token)).status,
    ).toBe(404);
    expect(
      (await f.request(`/tasks/${id}/cancel`, "POST", { version: 0 }, token))
        .status,
    ).toBe(404);
  }
  expect((await cancel(own, plain.token)).status).toBe(200);
  expect((await list("", school.token)).items.map((r) => r.id)).toEqual([a.id]);
  await expect(create("import", school, foreign.orgId)).rejects.toMatchObject({
    code: 90004,
  });
});
it("同账号不同身份也隔离，停用身份后同一令牌不能查/取消", async () => {
  const task = await create();
  const identityId = v7(),
    sessionId = v7(),
    orgId = v7();
  await f.pool.query(
    "INSERT INTO public.orgs(id,type,name,code) VALUES($1,'company','同账号另一组织',$1::uuid::text)",
    [orgId],
  );
  await f.pool.query(
    "INSERT INTO public.identities(id,user_id,org_id,type) VALUES($1,$2,$3,'company')",
    [identityId, f.admin.userId, orgId],
  );
  await f.pool.query(
    "INSERT INTO public.user_sessions(id,user_id,identity_id,refresh_token_hash,client,expires_at) VALUES($1,$2,$3,$4,'admin',now()+interval '1 day')",
    [
      sessionId,
      f.admin.userId,
      identityId,
      sessionId.replaceAll("-", "").repeat(2),
    ],
  );
  const token = await f.app.get(AccessTokenSigner).signIdentity({
    userId: f.admin.userId,
    identityId,
    sessionId,
    tokenVersion: 0,
  });
  expect((await list("", token)).total).toBe(0);
  expect(
    (await f.request(`/tasks/${task.id}`, "GET", undefined, token)).status,
  ).toBe(404);
  expect((await cancel(task, token)).status).toBe(404);
  await f.pool.query("UPDATE public.identities SET status=0 WHERE id=$1", [
    identityId,
  ]);
  expect((await f.request("/tasks", "GET", undefined, token)).status).toBe(403);
  expect((await cancel(task, token)).status).toBe(403);
  expect(await detail(task.id)).toEqual(task);
});
it("取消排队等待期间身份被停用，写事务重新鉴权拒绝变更", async () => {
  const person = await f.seed("company", null, f.admin.orgId),
    task = await create("import", person);
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
    const pending = cancel(task, person.token);
    await ready;
    await f.pool.query("UPDATE public.identities SET status=0 WHERE id=$1", [
      person.identityId,
    ]);
    release();
    expect((await pending).status).toBe(403);
  } finally {
    release();
    spy.mockRestore();
  }
  expect(await runner.checkpoint(task.id)).toEqual(task);
});
it("参数和身份级认证严格校验，无公开创建/进度/重试入口，软删不可见", async () => {
  const task = await create();
  expect((await fetch(`${f.base}/api/v1/tasks`)).status).toBe(401);
  expect(
    (await f.request("/tasks", "GET", undefined, f.admin.account)).status,
  ).toBe(401);
  for (const query of [
    "?mine=false",
    "?identityId=x",
    "?pageSize=101",
    "?status=cancelling",
    "?page=0",
  ])
    expect((await f.request(`/tasks${query}`)).status).toBe(400);
  for (const body of [{}, { version: -1 }, { version: 0, progress: 100 }])
    expect(
      (await f.request(`/tasks/${task.id}/cancel`, "POST", body)).status,
    ).toBe(400);
  expect((await f.request("/tasks/nope")).status).toBe(400);
  expect((await f.request(`/tasks/${v7()}`)).status).toBe(404);
  for (const path of [
    "/tasks",
    `/tasks/${task.id}/progress`,
    `/tasks/${task.id}/retry`,
  ])
    expect((await f.request(path, "POST", {})).status).toBe(404);
  await f.pool.query("UPDATE public.tasks SET deleted_at=now() WHERE id=$1", [
    task.id,
  ]);
  expect((await list()).total).toBe(0);
  expect((await f.request(`/tasks/${task.id}`)).status).toBe(404);
  expect((await cancel(task)).status).toBe(404);
});
it("数据库保护编号唯一、有效状态和进度范围及终态时间", async () => {
  const task = await create();
  for (const patch of [
    sql`progress=-1`,
    sql`progress=101`,
    sql`status='invented'`,
    sql`status='succeeded'`,
    sql`status='running'`,
    sql`finished_at=now()`,
    sql`summary='[]'::jsonb`,
  ])
    await expect(
      repository.transaction((tx) =>
        tx.execute(sql`UPDATE public.tasks SET ${patch} WHERE id=${task.id}`),
      ),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  const other = await create();
  await expect(
    f.pool.query("UPDATE public.tasks SET no=$1 WHERE id=$2", [
      task.no,
      other.id,
    ]),
  ).rejects.toMatchObject({ code: "23505" });
});

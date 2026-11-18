import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { WorkerConfig } from "@smart-sport/config/env";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Queue, QueueEvents } from "bullmq";
import { sql } from "drizzle-orm";
import { Redis } from "ioredis";
import pg from "pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { v7 } from "uuid";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { OutboxConsumerWorker } from "../../../worker/dist/outbox-consumer-worker.js";
import { OutboxPublisherWorker } from "../../../worker/dist/outbox-publisher-worker.js";
import { migratePublic } from "../../src/database/migrate.js";
import {
  migrateOutbox,
  outboxMigrationDirectory,
} from "../../src/database/migrate-outbox.js";
import { DataSourceRegistry } from "../../src/database/registry.js";
import {
  TenantMigrator,
  TenantRepository,
  TenantService,
} from "../../src/infra/tenant/index.js";
import {
  createOutboxServices,
  type OutboxTransaction,
  outboxJobId,
  outboxQueue,
} from "../../src/modules/foundation/outbox/index.js";
import { outboxEvents } from "../../src/schema/outbox.js";
import { POSTGRES_IMAGE } from "../helpers/postgres-image.js";

let postgres: StartedPostgreSqlContainer | undefined;
let redis: StartedTestContainer | undefined;
let sources: DataSourceRegistry;
let services: ReturnType<typeof createOutboxServices>;
let database: {
  DATABASE_URL: string;
  EXTRA_DATASOURCES: Record<string, string>;
};
let config: WorkerConfig;
const directories: string[] = [];
async function append(source = "default") {
  return sources.get(source).db.transaction((tx) =>
    services.writer.append(tx, {
      topic: "scope.changed",
      schoolId: null,
      payload: { recordId: v7(), version: 1 },
    }),
  );
}
async function event(id: string, source = "default") {
  return (
    await sources
      .get(source)
      .pool.query("SELECT * FROM public.outbox_events WHERE id=$1", [id])
  ).rows[0];
}
async function count(
  table: "outbox_events" | "outbox_consumptions" | "outbox_test_effects",
  source = "default",
) {
  const result = await sources
    .get(source)
    .db.execute(
      sql`SELECT count(*)::int AS n FROM ${sql.identifier("public")}.${sql.identifier(table)}`,
    );
  return result.rows[0]?.n;
}
async function effect(tx: OutboxTransaction) {
  await tx.execute(
    sql`INSERT INTO public.outbox_test_effects(id) VALUES(${v7()})`,
  );
}
async function until(check: () => Promise<boolean>, timeout = 15000) {
  const end = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("等待事件处理超时");
    await delay(50);
  }
}
beforeAll(async () => {
  postgres = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  redis = await new GenericContainer("redis:8.10.3-alpine3.23")
    .withExposedPorts(6379)
    .start();
  const remote = new URL(postgres.getConnectionUri());
  remote.pathname = "/outbox_remote";
  database = {
    DATABASE_URL: postgres.getConnectionUri(),
    EXTRA_DATASOURCES: { remote: remote.href },
  };
  sources = new DataSourceRegistry(database);
  await migratePublic(sources.get().pool);
  await sources.get().pool.query("CREATE DATABASE outbox_remote");
  for (const source of sources.keys()) {
    expect(await migrateOutbox(sources.get(source).pool)).toEqual([
      "0001_create_outbox.sql",
    ]);
    await sources
      .get(source)
      .pool.query(
        "CREATE TABLE public.outbox_test_effects(id uuid PRIMARY KEY)",
      );
  }
  services = createOutboxServices(sources);
  config = {
    NODE_ENV: "test",
    DATABASE_URL: database.DATABASE_URL,
    REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
    WORKER_QUEUE_PREFIX: `outbox-test-${Date.now()}`,
    S3_ENDPOINT: "http://localhost:9000",
    S3_REGION: "test",
    S3_BUCKET: "test",
    S3_ACCESS_KEY_ID: "test",
    S3_SECRET_ACCESS_KEY: "test-not-production-value",
    FIELD_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
    STUDENT_HMAC_KEY: Buffer.alloc(32).toString("base64"),
    apiDocsEnabled: false,
    demoSeedEnabled: true,
  };
}, 120000);
beforeEach(async () => {
  for (const source of sources.keys())
    await sources
      .get(source)
      .pool.query(
        "TRUNCATE public.outbox_events,public.outbox_consumptions,public.outbox_test_effects",
      );
});
afterAll(async () => {
  await sources?.onApplicationShutdown();
  await redis?.stop();
  await postgres?.stop();
  await Promise.all(
    directories.map((path) => rm(path, { recursive: true, force: true })),
  );
}, 30000);

it("逐数据源迁移可重跑，独立库没有平台业务表，拒绝历史漂移", async () => {
  for (const source of sources.keys())
    expect(await migrateOutbox(sources.get(source).pool)).toEqual([]);
  expect(
    (
      await sources
        .get("remote")
        .pool.query("SELECT to_regclass('public.users') AS name")
    ).rows[0]?.name,
  ).toBeNull();
  const path = await mkdtemp(`${tmpdir()}/outbox-history-`);
  directories.push(path);
  const directory = pathToFileURL(`${path}/`);
  await writeFile(new URL("0001_create_outbox.sql", directory), "SELECT 1");
  await expect(migrateOutbox(sources.get().pool, directory)).rejects.toThrow(
    "迁移失败",
  );
});

it("迁移中途失败不残留投递表或历史，修复后可重跑", async () => {
  await sources.get().pool.query("CREATE DATABASE outbox_rollback");
  const url = new URL(database.DATABASE_URL);
  url.pathname = "/outbox_rollback";
  const pool = new pg.Pool({ connectionString: url.href });
  try {
    const path = await mkdtemp(`${tmpdir()}/outbox-rollback-`);
    directories.push(path);
    const directory = pathToFileURL(`${path}/`);
    await writeFile(
      new URL("0001_create_outbox.sql", directory),
      await readFile(
        new URL("0001_create_outbox.sql", outboxMigrationDirectory),
      ),
    );
    await writeFile(new URL("0002_failure.sql", directory), "SELECT 1/0");
    await expect(migrateOutbox(pool, directory)).rejects.toThrow("迁移失败");
    expect(
      (
        await pool.query(
          "SELECT to_regclass('public.outbox_events') AS events,to_regclass('public._outbox_migrations') AS history",
        )
      ).rows[0],
    ).toEqual({ events: null, history: null });
    await writeFile(new URL("0002_failure.sql", directory), "SELECT 1");
    expect(await migrateOutbox(pool, directory)).toHaveLength(2);
  } finally {
    await pool.end();
  }
});

it("默认和独立学校库中业务与事件一起提交或回滚，学校表仍经TenantService访问", async () => {
  await sources
    .get()
    .pool.query(
      "INSERT INTO public.regions(code,name,level,path) VALUES('990000','事件测试省',1,'990000')",
    );
  const repository = new TenantRepository(sources.get().db);
  const migrator = new TenantMigrator(sources, repository);
  const tenants = new TenantService(repository, sources);
  for (const datasource of sources.keys()) {
    const schoolId = v7();
    await sources
      .get()
      .pool.query(
        "INSERT INTO public.orgs(id,type,name,code,region_code) VALUES($1::uuid,'school','事件测试学校',$1::text,'990000')",
        [schoolId],
      );
    expect(
      await migrator.provisionSchool(schoolId, { datasource }),
    ).toMatchObject({ status: "active" });
    const { db, t } = await tenants.forSchool(schoolId);
    await expect(
      db.transaction(async (tx) => {
        await tx
          .insert(t.classes)
          .values({ stage: 1, entryYear: 2026, classNo: 1 });
        await services.writer.append(tx, {
          topic: "school.student.created",
          schoolId,
          payload: { recordId: v7(), version: 0 },
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await db.select().from(t.classes)).toEqual([]);
    expect(await count("outbox_events", datasource)).toBe(0);
    await db.transaction(async (tx) => {
      await tx
        .insert(t.classes)
        .values({ stage: 1, entryYear: 2026, classNo: 1 });
      await services.writer.append(tx, {
        topic: "school.student.created",
        schoolId,
        payload: { recordId: v7(), version: 0 },
      });
    });
    expect(await count("outbox_events", datasource)).toBe(1);
  }
});

it("未提交事件不会投递，提交后可见；多个投递者跳过已锁行且不重复入队", async () => {
  let ready!: () => void;
  let commit!: () => void;
  const inserted = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const release = new Promise<void>((resolve) => {
    commit = resolve;
  });
  const producer = sources.get().db.transaction(async (tx) => {
    await services.writer.append(tx, {
      topic: "scope.changed",
      schoolId: null,
      payload: { recordId: v7(), version: 1 },
    });
    ready();
    await release;
  });
  await inserted;
  try {
    expect(
      await services.dispatcher.dispatch(
        async () => {
          throw new Error("未提交不可投递");
        },
        () => {},
      ),
    ).toEqual({ published: 0, retrying: 0, failed: 0, unavailable: 0 });
  } finally {
    commit();
    await producer;
  }
  for (let i = 0; i < 19; i++) await append(i % 2 ? "remote" : "default");
  const published: string[] = [];
  await Promise.all(
    Array.from({ length: 10 }, () =>
      services.dispatcher.dispatch(
        async (source, row) => {
          published.push(`${source}/${row.id}`);
        },
        () => {},
      ),
    ),
  );
  expect(published).toHaveLength(20);
  expect(new Set(published).size).toBe(20);
});

it("指数退避只重试到期事件，第11次失败保留死信并仅告警一次，其他事件继续", async () => {
  const id = await append();
  const good = await append("remote");
  const alerts: string[] = [];
  const publish = async (source: string) => {
    if (source === "default") throw new Error("private-driver-error");
  };
  await services.dispatcher.dispatch(publish, (kind) => alerts.push(kind));
  const first = await event(id);
  expect(first).toMatchObject({
    status: "pending",
    attempts: 1,
    last_error: "delivery_failed",
    published_at: null,
  });
  expect(first.next_retry_at.getTime()).toBeGreaterThan(
    first.updated_at.getTime() + 900,
  );
  expect((await event(good, "remote")).status).toBe("published");
  expect((await services.dispatcher.dispatch(publish, () => {})).retrying).toBe(
    0,
  );
  for (let failure = 2; failure <= 11; failure++) {
    await sources
      .get()
      .pool.query(
        "UPDATE public.outbox_events SET next_retry_at=now()-interval '1 second' WHERE id=$1",
        [id],
      );
    await services.dispatcher.dispatch(publish, (kind) => alerts.push(kind));
  }
  expect(await event(id)).toMatchObject({
    status: "failed",
    attempts: 11,
    next_retry_at: null,
    last_error: "delivery_failed",
  });
  expect(alerts).toEqual(["dead_letter"]);
  expect(
    (await services.dispatcher.dispatch(publish, (kind) => alerts.push(kind)))
      .failed,
  ).toBe(0);
  expect(await services.writer.failures("default")).toMatchObject([
    { id, attempts: 11 },
  ]);
});

it("一个数据源不可达不阻断另一个，未知来源不会落到默认库", async () => {
  const registry = new DataSourceRegistry({
    ...database,
    EXTRA_DATASOURCES: {
      offline: "postgres://test:test@127.0.0.1:1/test",
      ...database.EXTRA_DATASOURCES,
    },
  });
  try {
    const id = await append("remote");
    const alerts: string[] = [];
    expect(
      await createOutboxServices(registry).dispatcher.dispatch(
        async () => {},
        (kind) => alerts.push(kind),
      ),
    ).toMatchObject({ published: 1, unavailable: 1 });
    expect(alerts).toEqual(["datasource_unavailable"]);
    expect((await event(id, "remote")).status).toBe("published");
    await expect(
      services.consumer.consume(
        "remote",
        "test.effect",
        "scope.changed",
        { datasource: "missing", eventId: id },
        effect,
      ),
    ).rejects.toThrow("未配置");
    expect(await count("outbox_test_effects")).toBe(0);
  } finally {
    await registry.onApplicationShutdown();
  }
});

it("20次并发消费只生效一次；处理失败时去重标记与业务效果一起回滚", async () => {
  const eventId = await append();
  const reference = { datasource: "default", eventId };
  await expect(
    services.consumer.consume(
      "remote",
      "test.effect",
      "scope.changed",
      reference,
      async (tx) => {
        await effect(tx);
        throw new Error("rollback-effect");
      },
    ),
  ).rejects.toThrow("rollback-effect");
  expect(await count("outbox_consumptions", "remote")).toBe(0);
  expect(await count("outbox_test_effects", "remote")).toBe(0);
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      services.consumer.consume(
        "remote",
        "test.effect",
        "scope.changed",
        reference,
        effect,
      ),
    ),
  );
  expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
  expect(await count("outbox_test_effects", "remote")).toBe(1);
  expect(await count("outbox_consumptions", "remote")).toBe(1);
  await expect(
    services.consumer.consume(
      "remote",
      "test.effect",
      "subscription.changed",
      reference,
      effect,
    ),
  ).rejects.toThrow("主题不匹配");
  await expect(
    services.consumer.consume(
      "remote",
      "test.effect",
      "scope.changed",
      { datasource: "default", eventId: v7() },
      effect,
    ),
  ).rejects.toThrow("不存在");
});

it("来源和消费者分别隔离去重，非法事件结构与生命周期被拒绝", async () => {
  const id = await append();
  const first = await event(id);
  await sources
    .get("remote")
    .db.insert(outboxEvents)
    .values({ id, topic: "scope.changed", payload: first.payload });
  for (const [datasource, consumer] of [
    ["default", "test.a"],
    ["remote", "test.a"],
    ["default", "test.b"],
  ] as const)
    await services.consumer.consume(
      "remote",
      consumer,
      "scope.changed",
      { datasource, eventId: id },
      effect,
    );
  expect(await count("outbox_test_effects", "remote")).toBe(3);
  await expect(
    sources
      .get()
      .pool.query(
        "UPDATE public.outbox_events SET status='published' WHERE id=$1",
        [id],
      ),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    sources
      .get()
      .pool.query("UPDATE public.outbox_events SET attempts=-1 WHERE id=$1", [
        id,
      ]),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    sources.get().db.transaction((tx) =>
      services.writer.append(tx, {
        topic: "school.student.created",
        schoolId: null,
        payload: { recordId: v7(), version: 0 },
      }),
    ),
  ).rejects.toThrow();
});

it("真实publisher和消费worker完成跨库写入，重复队列任务不重复生效并安全拒绝坏载荷", async () => {
  const eventId = await append();
  const reference = { datasource: "default", eventId };
  const consumer = new OutboxConsumerWorker(config, database, {
    topic: "scope.changed",
    consumer: "test.worker",
    targetDatasource: "remote",
    effect,
  });
  const publisher = new OutboxPublisherWorker(config, database);
  const connection = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  const queue = new Queue(outboxQueue("scope.changed"), {
    connection,
    prefix: config.WORKER_QUEUE_PREFIX,
  });
  const events = new QueueEvents(outboxQueue("scope.changed"), {
    connection,
    prefix: config.WORKER_QUEUE_PREFIX,
  });
  try {
    await events.waitUntilReady();
    await consumer.start();
    await publisher.start();
    await until(
      async () =>
        (await count("outbox_test_effects", "remote")) === 1 &&
        (await event(eventId)).status === "published",
    );
    const original = await queue.getJob(outboxJobId(reference));
    expect(original?.data).toEqual(reference);
    const replay = await queue.add("scope.changed", reference);
    expect(await replay.waitUntilFinished(events, 10000)).toEqual({
      duplicate: true,
    });
    expect(await count("outbox_test_effects", "remote")).toBe(1);
    const bad = await queue.add("scope.changed", {
      ...reference,
      token: "not-a-real-token",
    });
    await expect(bad.waitUntilFinished(events, 10000)).rejects.toThrow(
      "参数无效",
    );
    expect(await count("outbox_test_effects", "remote")).toBe(1);
  } finally {
    await publisher.beforeApplicationShutdown();
    await consumer.beforeApplicationShutdown();
    await events.close();
    await queue.close();
    connection.disconnect();
  }
}, 30000);

it("入队已成功但数据库未记成功时固定jobId重投，最终只产生一次业务效果", async () => {
  const eventId = await append();
  const reference = { datasource: "default", eventId };
  const connection = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  const queue = new Queue(outboxQueue("scope.changed"), {
    connection,
    prefix: `${config.WORKER_QUEUE_PREFIX}-crash`,
  });
  let calls = 0;
  try {
    const publish = async () => {
      await queue.add("scope.changed", reference, {
        jobId: outboxJobId(reference),
      });
      if (++calls === 1) throw new Error("after-queue-before-db");
    };
    await services.dispatcher.dispatch(publish, () => {});
    expect((await event(eventId)).status).toBe("pending");
    await sources
      .get()
      .pool.query(
        "UPDATE public.outbox_events SET next_retry_at=now()-interval '1 second' WHERE id=$1",
        [eventId],
      );
    await services.dispatcher.dispatch(publish, () => {});
    expect((await event(eventId)).status).toBe("published");
    expect(await queue.getWaitingCount()).toBe(1);
    await services.consumer.consume(
      "remote",
      "test.crash",
      "scope.changed",
      reference,
      effect,
    );
    await services.consumer.consume(
      "remote",
      "test.crash",
      "scope.changed",
      reference,
      effect,
    );
    expect(await count("outbox_test_effects", "remote")).toBe(1);
  } finally {
    await queue.obliterate({ force: true });
    await queue.close();
    connection.disconnect();
  }
});

it("发布迁移命令向新增数据源部署投递表，不复制平台业务表且可安全重跑", async () => {
  await sources.get().pool.query("CREATE DATABASE outbox_cli");
  const fresh = new URL(database.DATABASE_URL);
  fresh.pathname = "/outbox_cli";
  const execute = promisify(execFile);
  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: database.DATABASE_URL,
    EXTRA_DATASOURCES: JSON.stringify({
      ...database.EXTRA_DATASOURCES,
      fresh: fresh.href,
    }),
  };
  const cli = new URL("../../dist/database/migrate-cli.js", import.meta.url);
  const first = await execute(process.execPath, [cli.pathname], {
    env,
    timeout: 30000,
  });
  expect(first.stdout).toContain("投递基础设施fresh：新增1个迁移");
  const again = await execute(process.execPath, [cli.pathname], {
    env,
    timeout: 30000,
  });
  expect(again.stdout).toContain("投递基础设施fresh：新增0个迁移");
  const pool = new pg.Pool({ connectionString: fresh.href });
  try {
    expect(
      (
        await pool.query(
          "SELECT to_regclass('public.outbox_events') AS events,to_regclass('public.users') AS users",
        )
      ).rows[0],
    ).toEqual({ events: "outbox_events", users: null });
    const failure = await execute(process.execPath, [cli.pathname], {
      env: {
        ...env,
        EXTRA_DATASOURCES: JSON.stringify({
          ...database.EXTRA_DATASOURCES,
          offline: "postgres://test:test@127.0.0.1:1/test",
        }),
      },
      timeout: 10000,
    }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ code: 1 });
  } finally {
    await pool.end();
  }
}, 60000);

it("真实消费失败重试11次后保留失败任务，所有目标写入和去重标记均回滚", async () => {
  const eventId = await append();
  const localConfig = {
    ...config,
    WORKER_QUEUE_PREFIX: `${config.WORKER_QUEUE_PREFIX}-retry`,
  };
  let calls = 0;
  const worker = new OutboxConsumerWorker(localConfig, database, {
    topic: "scope.changed",
    consumer: "test.failure",
    targetDatasource: "remote",
    effect: async (tx) => {
      calls++;
      await effect(tx);
      throw new Error("private-handler-error");
    },
  });
  const connection = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  const queue = new Queue(outboxQueue("scope.changed"), {
    connection,
    prefix: localConfig.WORKER_QUEUE_PREFIX,
  });
  const events = new QueueEvents(outboxQueue("scope.changed"), {
    connection,
    prefix: localConfig.WORKER_QUEUE_PREFIX,
  });
  try {
    await events.waitUntilReady();
    await worker.start();
    const job = await queue.add(
      "scope.changed",
      { datasource: "default", eventId },
      {
        attempts: 11,
        backoff: { type: "exponential", delay: 1 },
        removeOnFail: false,
      },
    );
    await expect(job.waitUntilFinished(events, 15000)).rejects.toThrow(
      "事件消费失败",
    );
    expect(calls).toBe(11);
    const failed = await queue.getJob(job.id as string);
    expect(failed?.attemptsMade).toBe(11);
    expect(await failed?.getState()).toBe("failed");
    expect(failed?.failedReason).not.toContain("private-handler-error");
    expect(await count("outbox_consumptions", "remote")).toBe(0);
    expect(await count("outbox_test_effects", "remote")).toBe(0);
  } finally {
    await worker.beforeApplicationShutdown();
    await events.close();
    await queue.obliterate({ force: true });
    await queue.close();
    connection.disconnect();
  }
}, 30000);

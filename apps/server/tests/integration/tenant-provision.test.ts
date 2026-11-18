import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  loadProvisionCommandConfig,
  type WorkerConfig,
} from "@smart-sport/config/env";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { SchoolProvisionWorker } from "../../../worker/dist/school-provision-worker.js";
import { migratePublic } from "../../src/database/migrate.js";
import { DataSourceRegistry } from "../../src/database/registry.js";
import { auditWriter } from "../../src/infra/audit/audit-writer.js";
import {
  schoolSchemaName,
  TenantMigrator,
  TenantRepository,
  TenantService,
} from "../../src/infra/tenant/index.js";
import { MigrationRegistry } from "../../src/infra/tenant/migration-registry.js";
import { ProvisionRepository } from "../../src/infra/tenant/provision.repository.js";
import { provisionQueue } from "../../src/infra/tenant/provision-job.js";
import { POSTGRES_IMAGE } from "../helpers/postgres-image.js";

const exec = promisify(execFile);
let postgres: StartedPostgreSqlContainer | undefined;
let redis: StartedTestContainer | undefined;
let sources: DataSourceRegistry;
let migrator: TenantMigrator;
let config: WorkerConfig;
let worker: SchoolProvisionWorker;
let connection: Redis;
let queue: Queue;
let events: QueueEvents;
const directories: string[] = [];
const ddl = "CREATE TABLE __SCHEMA__.probe(id integer PRIMARY KEY)";
async function directory() {
  const path = await mkdtemp(`${tmpdir()}/tenant-provision-`);
  directories.push(path);
  const url = pathToFileURL(`${path}/`);
  await writeFile(new URL("0001_initial.sql", url), ddl);
  return url;
}
async function school() {
  const id = v7();
  await sources
    .get()
    .pool.query(
      "INSERT INTO public.orgs(id,type,name,code,region_code) VALUES($1::uuid,'school','开通测试学校',$1::text,'990000')",
      [id],
    );
  return id;
}
async function tenant(id: string) {
  return (
    await sources
      .get()
      .pool.query("SELECT * FROM public.school_tenants WHERE school_id=$1", [
        id,
      ])
  ).rows[0];
}
async function exists(id: string, datasource = "default") {
  return (
    (
      await sources
        .get(datasource)
        .pool.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [
          schoolSchemaName(id),
        ])
    ).rowCount === 1
  );
}
async function audits(id: string) {
  return (
    await sources
      .get()
      .pool.query(
        "SELECT action FROM public.audit_logs WHERE school_id=$1 ORDER BY created_at",
        [id],
      )
  ).rows.map((r) => r.action);
}

beforeAll(async () => {
  postgres = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  redis = await new GenericContainer("redis:8.10.3-alpine3.23")
    .withExposedPorts(6379)
    .start();
  const remote = new URL(postgres.getConnectionUri());
  remote.pathname = "/provision_remote";
  const database = {
    DATABASE_URL: postgres.getConnectionUri(),
    EXTRA_DATASOURCES: { remote: remote.href },
  };
  sources = new DataSourceRegistry(database);
  await migratePublic(sources.get().pool);
  await sources.get().pool.query("CREATE DATABASE provision_remote");
  await sources
    .get()
    .pool.query(
      "INSERT INTO public.regions(code,name,level,path) VALUES('990000','开通测试省',1,'990000')",
    );
  migrator = new TenantMigrator(
    sources,
    new TenantRepository(sources.get().db),
  );
  config = {
    NODE_ENV: "test",
    DATABASE_URL: database.DATABASE_URL,
    REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
    WORKER_QUEUE_PREFIX: `provision-test-${Date.now()}`,
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
  worker = new SchoolProvisionWorker(config, database);
  await worker.start();
  connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  queue = new Queue(provisionQueue, {
    connection,
    prefix: config.WORKER_QUEUE_PREFIX,
  });
  events = new QueueEvents(provisionQueue, {
    connection,
    prefix: config.WORKER_QUEUE_PREFIX,
  });
  await events.waitUntilReady();
}, 120000);
afterAll(async () => {
  vi.restoreAllMocks();
  await worker?.beforeApplicationShutdown();
  await events?.close();
  await queue?.close();
  connection?.disconnect();
  await sources?.onApplicationShutdown();
  await redis?.stop();
  await postgres?.stop();
  await Promise.all(
    directories.map((p) => rm(p, { recursive: true, force: true })),
  );
}, 30000);

it("两校开通隔离、全量历史、状态及审计，重复开通不重复DDL或审计", async () => {
  const ids = [await school(), await school()];
  const dir = await directory();
  for (const id of ids) {
    expect(
      await migrator.provisionSchool(id, { directory: dir }),
    ).toMatchObject({ status: "active", schemaVersion: 1 });
    expect(await tenant(id)).toMatchObject({
      status: "active",
      schema_version: 1,
      last_error: null,
    });
    expect(await audits(id)).toEqual(["tenant.provision"]);
    const version = (await tenant(id)).version;
    expect(
      await migrator.provisionSchool(id, { directory: dir }),
    ).toMatchObject({ status: "active", applied: [] });
    expect((await tenant(id)).version).toBe(version);
    expect(await audits(id)).toEqual(["tenant.provision"]);
  }
  const service = new TenantService(
    new TenantRepository(sources.get().db),
    sources,
  );
  const first = await service.forSchool(ids[0] as string);
  const second = await service.forSchool(ids[1] as string);
  expect(first.t).not.toBe(second.t);
});

it("第二个迁移失败不残留schema与半套表，保留失败登记，修好后重试成功", async () => {
  const id = await school();
  const dir = await directory();
  await writeFile(new URL("0002_failure.sql", dir), "SELECT 1/0");
  expect(await migrator.provisionSchool(id, { directory: dir })).toMatchObject({
    status: "failed",
    failureRecorded: true,
  });
  expect(await exists(id)).toBe(false);
  expect(await tenant(id)).toMatchObject({
    status: "failed",
    schema_version: 0,
  });
  expect(await audits(id)).toEqual(["tenant.provision.failed"]);
  await expect(
    new TenantService(
      new TenantRepository(sources.get().db),
      sources,
    ).forSchool(id),
  ).rejects.toMatchObject({ code: 90004 });
  await writeFile(
    new URL("0002_failure.sql", dir),
    "ALTER TABLE __SCHEMA__.probe ADD COLUMN note text",
  );
  expect(await migrator.provisionSchool(id, { directory: dir })).toMatchObject({
    status: "active",
    schemaVersion: 2,
  });
  expect(await exists(id)).toBe(true);
  expect(await audits(id)).toEqual([
    "tenant.provision.failed",
    "tenant.provision",
  ]);
});

it("同校10个并发开通只执行一次，成功审计只有一条", async () => {
  const id = await school();
  const dir = await directory();
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      migrator.provisionSchool(id, { directory: dir }),
    ),
  );
  expect(results.every((r) => r.status === "active")).toBe(true);
  expect(
    results.filter((r) => r.status === "active" && r.applied.length),
  ).toHaveLength(1);
  expect(await audits(id)).toEqual(["tenant.provision"]);
});

it("跨数据源失败无残留，目标提交后登记失败可恢复且不重复执行", async () => {
  const id = await school();
  const dir = await directory();
  await writeFile(new URL("0002_failure.sql", dir), "SELECT 1/0");
  expect(
    await migrator.provisionSchool(id, {
      directory: dir,
      datasource: "remote",
    }),
  ).toMatchObject({ status: "failed" });
  expect(await exists(id, "remote")).toBe(false);
  await writeFile(
    new URL("0002_failure.sql", dir),
    "ALTER TABLE __SCHEMA__.probe ADD COLUMN note text",
  );
  const success = vi
    .spyOn(MigrationRegistry.prototype, "success")
    .mockRejectedValueOnce(new Error("private-connection"));
  expect(await migrator.provisionSchool(id, { directory: dir })).toMatchObject({
    status: "failed",
  });
  success.mockRestore();
  expect(await exists(id, "remote")).toBe(true);
  expect(await exists(id)).toBe(false);
  expect((await tenant(id)).schema_version).toBe(0);
  expect(await migrator.provisionSchool(id, { directory: dir })).toMatchObject({
    status: "active",
    applied: [],
    schemaVersion: 2,
  });
  expect((await tenant(id)).last_error).toBeNull();
});

it("审计写入失败与默认库DDL及成功状态一起回滚", async () => {
  const id = await school();
  const dir = await directory();
  const audit = vi
    .spyOn(auditWriter, "writeClient")
    .mockRejectedValueOnce(new Error("audit failure"));
  expect(await migrator.provisionSchool(id, { directory: dir })).toMatchObject({
    status: "failed",
    failureRecorded: true,
  });
  audit.mockRestore();
  expect(await exists(id)).toBe(false);
  expect((await tenant(id)).status).toBe("failed");
  expect(await migrator.provisionSchool(id, { directory: dir })).toMatchObject({
    status: "active",
  });
});

it("不存在、非学校、停用、软删除、归档和销毁不可开通，不能换已有数据源", async () => {
  const dir = await directory();
  for (const id of [v7(), "bad"]) {
    await expect(
      migrator.provisionSchool(id, { directory: dir }),
    ).rejects.toMatchObject({ code: 90004 });
  }
  for (const sql of [
    "UPDATE public.orgs SET type='company',region_code=NULL WHERE id=$1",
    "UPDATE public.orgs SET status=0 WHERE id=$1",
    "UPDATE public.orgs SET deleted_at=now() WHERE id=$1",
  ]) {
    const id = await school();
    await sources.get().pool.query(sql, [id]);
    await expect(
      migrator.provisionSchool(id, { directory: dir }),
    ).rejects.toMatchObject({ code: 90004 });
    expect(await exists(id)).toBe(false);
  }
  for (const status of ["suspended", "archived", "destroyed"]) {
    const id = await school();
    await sources
      .get()
      .pool.query(
        "INSERT INTO public.school_tenants(school_id,schema_name,status) VALUES($1,$2,$3)",
        [id, schoolSchemaName(id), status],
      );
    await expect(
      migrator.provisionSchool(id, { directory: dir }),
    ).rejects.toMatchObject({ code: 90004 });
    expect((await tenant(id)).status).toBe(status);
  }
  const id = await school();
  await migrator.provisionSchool(id, { directory: dir });
  expect(
    await migrator.provisionSchool(id, {
      directory: dir,
      datasource: "remote",
    }),
  ).toMatchObject({ status: "failed" });
  expect((await tenant(id)).status).toBe("active");
  expect(await exists(id, "remote")).toBe(false);
});

it("真实BullMQ消费者开通、拒绝坏载荷并安全记录任务失败", async () => {
  const id = await school();
  const job = await queue.add("provision", { schoolId: id });
  expect(await job.waitUntilFinished(events, 15000)).toMatchObject({
    status: "active",
  });
  expect((await tenant(id)).status).toBe("active");
  const bad = await queue.add("provision", {
    schoolId: id,
    schemaName: "public",
  });
  await expect(bad.waitUntilFinished(events, 15000)).rejects.toThrow(
    "参数无效",
  );
  const missing = await queue.add(
    "provision",
    { schoolId: v7() },
    { attempts: 2 },
  );
  await expect(missing.waitUntilFinished(events, 15000)).rejects.toThrow(
    "开通失败",
  );
}, 30000);

it("补开通命令实际投递并等待worker完成，重复执行无副作用，生产和缺省环境禁用", async () => {
  const first = await school();
  const second = await school();
  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: config.DATABASE_URL,
    EXTRA_DATASOURCES: "{}",
    REDIS_URL: config.REDIS_URL,
    WORKER_QUEUE_PREFIX: config.WORKER_QUEUE_PREFIX,
  };
  const cli = new URL("../../../worker/dist/provision-cli.js", import.meta.url);
  const backfill = await exec(process.execPath, [cli.pathname, "--all"], {
    env,
    timeout: 60000,
  });
  expect(backfill.stdout).toContain("学校开通");
  for (const id of [first, second])
    expect((await tenant(id)).status).toBe("active");
  const version = (await tenant(first)).version;
  const again = await exec(process.execPath, [cli.pathname, "--all"], {
    env,
    timeout: 60000,
  });
  expect(again.stdout).toContain("无需补开通");
  expect((await tenant(first)).version).toBe(version);
  const single = await school();
  await exec(process.execPath, [cli.pathname, single], { env, timeout: 60000 });
  expect((await tenant(single)).status).toBe("active");
  const prohibited = await school();
  await expect(
    exec(process.execPath, [cli.pathname, prohibited], {
      env: { ...env, NODE_ENV: "production" },
      timeout: 10000,
    }),
  ).rejects.toMatchObject({ code: 1 });
  expect(await tenant(prohibited)).toBeUndefined();
  expect(() => loadProvisionCommandConfig({ ...env, NODE_ENV: "" })).toThrow();
  const candidates = await new ProvisionRepository(
    sources.get().db,
  ).candidates();
  expect(candidates).toContain(prohibited);
}, 90000);

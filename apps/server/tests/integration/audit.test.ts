import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migratePublic } from "../../src/database/migrate.js";
import { auditWriter } from "../../src/infra/audit/audit-writer.js";
import { AuditPartitionsRepository } from "../../src/modules/platform/audit/index.js";
import { users } from "../../src/schema/public.js";

let container: StartedPostgreSqlContainer | undefined;
let pool: pg.Pool;
let db: NodePgDatabase;
let partitions: AuditPartitionsRepository;
beforeAll(async () => {
  container = await new PostgreSqlContainer(
    "postgres:17.11-alpine3.23",
  ).start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await migratePublic(pool);
  db = drizzle(pool);
  partitions = new AuditPartitionsRepository(db);
}, 120000);
afterAll(async () => {
  await pool?.end();
  await container?.stop();
}, 30000);

it("事务内保存字段差异及请求关联，不保存敏感前后值，UUID为v7", async () => {
  const id = v7(),
    traceId = v7(),
    userId = v7(),
    identityId = v7(),
    orgId = v7();
  await db.transaction((tx) =>
    auditWriter.write(tx, {
      id,
      userId,
      identityId,
      orgId,
      traceId,
      action: "test.audit",
      targetType: "test",
      targetId: v7(),
      changes: {
        before: { name: "原名", phone: "13800000000" },
        after: { name: "新名", phone: "13900000000" },
        nested: [{ passwordHash: "private", id_card_number: "private" }],
      },
      ip: "127.0.0.1",
      userAgent: "integration-test",
      createdAt: new Date(),
    }),
  );
  const saved = (
    await pool.query("SELECT * FROM public.audit_logs WHERE id=$1", [id])
  ).rows[0];
  expect(saved).toMatchObject({
    user_id: userId,
    identity_id: identityId,
    org_id: orgId,
    trace_id: traceId,
    ip: "127.0.0.1",
    user_agent: "integration-test",
    changes: {
      name: ["原名", "新名"],
      phone: "已修改",
      nested: [{ passwordHash: "已修改", id_card_number: "已修改" }],
    },
  });
  expect(saved.id.split("-")[2][0]).toBe("7");
  expect(JSON.stringify(saved)).not.toMatch(/13800000000|13900000000|private/);
});
it("审计写入失败时业务数据整体回滚，不会留下业务或审计半成品", async () => {
  const id = v7(),
    auditId = v7();
  const createdAt = new Date();
  await expect(
    db.transaction(async (tx) => {
      await tx.insert(users).values({
        id,
        username: `audit-${id}`,
        realName: "审计事务测试",
        passwordHash: "test-only-hash",
      });
      await auditWriter.write(tx, {
        id: auditId,
        action: "test.rollback",
        createdAt,
        changes: { name: [null, "新增"] },
      });
      // 相同分区内主键冲突：真实数据库拒绝第二次写入。
      await auditWriter.write(tx, {
        id: auditId,
        action: "test.rollback",
        createdAt,
        changes: null,
      });
    }),
  ).rejects.toThrow();
  expect(
    (await pool.query("SELECT id FROM public.users WHERE id=$1", [id]))
      .rowCount,
  ).toBe(0);
  expect(
    (
      await pool.query("SELECT id FROM public.audit_logs WHERE id=$1", [
        auditId,
      ])
    ).rowCount,
  ).toBe(0);
});
it("长期停机后的兜底记录按上海月边界搬迁，多个实例并发维护不丢不重", async () => {
  const dates = [
    "2011-03-31T23:59:59.999+08:00",
    "2011-04-01T00:00:00+08:00",
    "2011-04-30T23:59:59.999+08:00",
    "2011-05-01T00:00:00+08:00",
  ];
  const ids = dates.map(() => v7());
  for (let i = 0; i < dates.length; i++)
    await db.transaction((tx) =>
      auditWriter.write(tx, {
        id: ids[i],
        action: "test.partition",
        changes: { index: i },
        createdAt: new Date(dates[i] as string),
      }),
    );
  expect(
    (
      await pool.query(
        "SELECT count(*)::int total FROM public.audit_logs_default WHERE id=ANY($1::uuid[])",
        [ids],
      )
    ).rows[0].total,
  ).toBe(4);
  await Promise.all([
    partitions.prepare(),
    new AuditPartitionsRepository(db).prepare(),
  ]);
  const saved = (
    await pool.query(
      "SELECT id,created_at,changes,tableoid::regclass::text AS partition FROM public.audit_logs WHERE id=ANY($1::uuid[]) ORDER BY created_at",
      [ids],
    )
  ).rows;
  expect(saved).toHaveLength(4);
  expect(saved.map((row) => row.partition)).toEqual([
    "audit_logs_2011_03",
    "audit_logs_2011_04",
    "audit_logs_2011_04",
    "audit_logs_2011_05",
  ]);
  expect(saved.map((row) => row.created_at.toISOString())).toEqual(
    dates.map((date) => new Date(date).toISOString()),
  );
  expect(saved.map((row) => row.changes.index)).toEqual([0, 1, 2, 3]);
  expect(
    (
      await pool.query(
        "SELECT id FROM public.audit_logs_default WHERE id=ANY($1::uuid[])",
        [ids],
      )
    ).rowCount,
  ).toBe(0);
  const future = await pool.query(
    "SELECT to_regclass('public.audit_logs_' || to_char(date_trunc('month',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai') + interval '2 months','YYYY_MM')) AS name",
  );
  expect(future.rows[0].name).toBeTruthy();
});
it("分区搬迁途中失败时新表与搬迁一起回滚，兜底记录仍完整可重试", async () => {
  const id = v7();
  await db.transaction((tx) =>
    auditWriter.write(tx, {
      id,
      action: "test.partition.failure",
      changes: null,
      createdAt: new Date("2012-04-01T00:00:00+08:00"),
    }),
  );
  await pool.query(
    `CREATE FUNCTION public.reject_audit_partition_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test partition failure'; END $$`,
  );
  await pool.query(
    "CREATE TRIGGER reject_audit_partition_delete BEFORE DELETE ON public.audit_logs_default FOR EACH ROW EXECUTE FUNCTION public.reject_audit_partition_delete()",
  );
  try {
    await expect(partitions.prepare()).rejects.toThrow();
    expect(
      (
        await pool.query(
          "SELECT id FROM public.audit_logs_default WHERE id=$1",
          [id],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT to_regclass('public.audit_logs_2012_04') AS name",
        )
      ).rows[0].name,
    ).toBeNull();
  } finally {
    await pool.query(
      "DROP TRIGGER reject_audit_partition_delete ON public.audit_logs_default",
    );
    await pool.query("DROP FUNCTION public.reject_audit_partition_delete()");
  }
  await partitions.prepare();
  expect(
    (
      await pool.query("SELECT id FROM public.audit_logs_2012_04 WHERE id=$1", [
        id,
      ])
    ).rowCount,
  ).toBe(1);
});

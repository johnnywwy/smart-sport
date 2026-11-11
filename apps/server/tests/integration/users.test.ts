import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { v7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migratePublic } from "../../src/database/migrate.js";
import { PasswordHasher } from "../../src/infra/crypto/password-hasher.js";
import { users } from "../../src/schema/public.js";

let container: StartedPostgreSqlContainer | undefined;
let pool: pg.Pool;
let passwordHash: string;
const hasher = new PasswordHasher();
const encryptionKey = randomBytes(32);
const hmacKey = randomBytes(32);

function encryptedPhone(phone: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(phone, "utf8"),
    cipher.final(),
  ]);
  return {
    phone: `v1:${iv.toString("base64")}:${ciphertext.toString("base64")}:${cipher.getAuthTag().toString("base64")}`,
    phoneHash: createHmac("sha256", hmacKey)
      .update(`phone:${phone}`)
      .digest("hex"),
  };
}
function insert(overrides: Partial<typeof users.$inferInsert> = {}) {
  return drizzle(pool)
    .insert(users)
    .values({
      username: `user-${v7()}`,
      realName: "测试账号",
      passwordHash,
      ...overrides,
    })
    .returning();
}

beforeAll(async () => {
  container = await new PostgreSqlContainer(
    "postgres:17.11-alpine3.23",
  ).start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  passwordHash = await hasher.hash("123456");
}, 120000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
}, 30000);

describe("用户表 PostgreSQL 17 迁移与约束", () => {
  it("首次迁移完成，再次执行不重复应用", async () => {
    expect(await migratePublic(pool)).toEqual([
      "0001_create_users.sql",
      "0002_users_username_unique.sql",
      "0003_users_phone_hash_unique.sql",
      "0004_users_email_unique.sql",
      "0005_create_user_sessions.sql",
      "0006_create_identities.sql",
      "0007_identities_unique.sql",
      "0008_create_login_logs.sql",
      "0009_create_audit_logs.sql",
      "0010_audit_logs_initial_partitions.sql",
      "0011_audit_logs_fallback_partition.sql",
      "0012_create_refresh_tokens.sql",
      "0013_refresh_tokens_session_index.sql",
      "0014_backfill_refresh_tokens.sql",
    ]);
    expect(await migratePublic(pool)).toEqual([]);
  });

  it("Drizzle 生成 UUID v7、公共字段和安全初始状态", async () => {
    const [row] = await insert();
    expect(row?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(row).toMatchObject({
      version: 0,
      status: 1,
      mustChangePassword: true,
      failedAttempts: 0,
      tokenVersion: 0,
      phone: null,
      phoneHash: null,
    });
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(await hasher.verify(row?.passwordHash ?? "", "123456")).toBe(true);
  });

  it("加密手机号可超过 20 字符，同一手机号密文不同仍能查重", async () => {
    const first = encryptedPhone("13812345678");
    const second = encryptedPhone("13812345678");
    expect(first.phone).not.toBe(second.phone);
    expect(first.phoneHash).toBe(second.phoneHash);
    expect(first.phone.length).toBeGreaterThan(20);
    const [row] = await insert(first);
    expect(row?.phone).not.toContain("13812345678");
    await expect(insert(second)).rejects.toMatchObject({
      cause: { code: "23505" },
    });
    const found = await drizzle(pool)
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phoneHash, first.phoneHash));
    expect(found).toEqual([{ id: row?.id }]);
  });

  it("用户名、手机号哈希和邮箱删除前唯一，软删除后均可复用", async () => {
    const values = {
      username: "reuse-user",
      email: "reuse@example.test",
      ...encryptedPhone("13912345678"),
    };
    const [row] = await insert(values);
    for (const duplicate of [
      { username: values.username },
      { email: values.email },
      encryptedPhone("13912345678"),
    ]) {
      await expect(insert(duplicate)).rejects.toMatchObject({
        cause: { code: "23505" },
      });
    }
    await drizzle(pool)
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, row?.id ?? ""));
    await expect(insert(values)).resolves.toHaveLength(1);
  });

  it("允许多个账号都不绑定手机号和邮箱", async () => {
    await expect(insert()).resolves.toHaveLength(1);
    await expect(insert()).resolves.toHaveLength(1);
  });

  it("拒绝手机号与哈希缺一，以及不合法的哈希", async () => {
    const pair = encryptedPhone("13712345678");
    for (const invalid of [
      { phone: pair.phone },
      { phoneHash: pair.phoneHash },
      { phone: pair.phone, phoneHash: "a".repeat(63) },
      { phone: pair.phone, phoneHash: "G".repeat(64) },
    ]) {
      await expect(insert(invalid)).rejects.toMatchObject({
        cause: { code: "23514" },
      });
    }
  });

  it("拒绝无效状态和负数计数", async () => {
    for (const invalid of [
      { status: 2 },
      { failedAttempts: -1 },
      { tokenVersion: -1 },
      { version: -1 },
    ]) {
      await expect(insert(invalid)).rejects.toMatchObject({
        cause: { code: "23514" },
      });
    }
  });
});

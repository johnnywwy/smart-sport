import "reflect-metadata";
import {
  createCipheriv,
  createHash,
  createHmac,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { ServerConfig } from "@smart-sport/config/env";
import {
  apiResponseSchema,
  loginResponseSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { jwtVerify } from "jose";
import { ClsModule, ClsService } from "nestjs-cls";
import pg from "pg";
import { v7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ApiExceptionFilter,
  ApiResponseInterceptor,
} from "../../src/api-response.js";
import { migratePublic } from "../../src/database/migrate.js";
import { DRIZZLE } from "../../src/database/registry.js";
import { AccessTokenSigner } from "../../src/infra/auth/access-token-signer.js";
import { PasswordHasher } from "../../src/infra/crypto/password-hasher.js";
import { AuthController } from "../../src/modules/platform/auth/auth.controller.js";
import { AuthRepository } from "../../src/modules/platform/auth/auth.repository.js";
import { AuthService } from "../../src/modules/platform/auth/auth.service.js";
import { requestContextMiddleware } from "../../src/request-context.js";
import { identities, users } from "../../src/schema/public.js";
import { SERVER_CONFIG } from "../../src/server-config.js";

let container: StartedPostgreSqlContainer | undefined;
let pool: pg.Pool;
let app: INestApplication;
let base: string;
const pair = generateKeyPairSync("ed25519");
const userId = v7();
const hasher = new PasswordHasher();
const config = {
  NODE_ENV: "test",
  JWT_PRIVATE_KEY: pair.privateKey
    .export({ format: "der", type: "pkcs8" })
    .toString("base64"),
  JWT_KEY_ID: "login-test",
  STUDENT_HMAC_KEY: Buffer.alloc(32, 1).toString("base64"),
} as ServerConfig;
const login = (account: string, password = "123456") =>
  fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, password }),
  });

beforeAll(async () => {
  container = await new PostgreSqlContainer(
    "postgres:17.11-alpine3.23",
  ).start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await migratePublic(pool);
  await drizzle(pool)
    .insert(users)
    .values({
      id: userId,
      username: "demo",
      email: "demo@example.test",
      realName: "测试",
      passwordHash: await hasher.hash("123456"),
    });
  await drizzle(pool)
    .insert(identities)
    .values(
      ["school", "teacher", "student", "parent"].map((type) => ({
        userId,
        orgId: v7(),
        type,
      })),
    );
  const module = await Test.createTestingModule({
    imports: [ClsModule.forRoot({ global: true })],
    controllers: [AuthController],
    providers: [
      AuthService,
      AuthRepository,
      PasswordHasher,
      AccessTokenSigner,
      { provide: DRIZZLE, useValue: drizzle(pool) },
      { provide: SERVER_CONFIG, useValue: config },
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
      { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
    ],
  }).compile();
  app = module.createNestApplication();
  app.use(requestContextMiddleware(app.get(ClsService)));
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
}, 120000);
afterAll(async () => {
  await app?.close();
  await pool?.end();
  await container?.stop();
}, 30000);

describe("真实 HTTP 登录", () => {
  it("登录创建会话、返回真实后台身份数量与安全 Cookie", async () => {
    const response = await login("demo");
    expect(response.status).toBe(200);
    const body = successResponseSchema(loginResponseSchema).parse(
      await response.json(),
    );
    expect(body).toMatchObject({
      code: 0,
      data: { identityCount: 2, mustChangePassword: true },
    });
    const { payload } = await jwtVerify(body.data.accessToken, pair.publicKey);
    expect(payload).toMatchObject({
      sub: userId,
      stage: "account",
      client: "admin",
    });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api/v1/auth;");
    const token = /refresh_token=([^;]+)/.exec(cookie)?.[1] ?? "";
    const session = await pool.query(
      "SELECT * FROM public.user_sessions WHERE id=$1",
      [payload.sid],
    );
    expect(session.rows[0].refresh_token_hash).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
    expect(session.rows[0].identity_id).toBeNull();
    const audit = await pool.query(
      "SELECT * FROM public.audit_logs WHERE trace_id=$1",
      [body.traceId],
    );
    expect(audit.rows[0]).toMatchObject({
      action: "auth.login",
      user_id: userId,
      changes: { result: "success" },
    });
  });
  it("邮箱可登录", async () => {
    expect((await login("demo@example.test")).status).toBe(200);
  });
  it("不存在与密码错误返回相同错误，失败也持久化日志", async () => {
    const absent = await login("missing");
    const wrong = await login("demo", "wrong");
    expect(absent.status).toBe(401);
    expect(wrong.status).toBe(401);
    const a = apiResponseSchema.parse(await absent.json()),
      b = apiResponseSchema.parse(await wrong.json());
    expect({ code: a.code, message: a.message, data: a.data }).toEqual({
      code: b.code,
      message: b.message,
      data: b.data,
    });
    expect(a.code).toBe(10001);
    const logs = await pool.query(
      "SELECT result FROM public.login_logs WHERE result='bad_password'",
    );
    expect(logs.rowCount).toBe(2);
    expect(wrong.headers.get("set-cookie")).toBeNull();
  });
  it("手机号按 HMAC 查找，登录日志不保存明文手机号", async () => {
    const phone = "13812345678";
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", randomBytes(32), iv);
    const encrypted = Buffer.concat([cipher.update(phone), cipher.final()]);
    const phoneHash = createHmac(
      "sha256",
      Buffer.from(config.STUDENT_HMAC_KEY, "base64"),
    )
      .update(`phone:${phone}`)
      .digest("hex");
    await drizzle(pool)
      .insert(users)
      .values({
        username: "phone-user",
        realName: "测试",
        passwordHash: await hasher.hash("123456"),
        phone: `v1:${iv.toString("base64")}:${encrypted.toString("base64")}:${cipher.getAuthTag().toString("base64")}`,
        phoneHash,
      });
    const response = await login(phone);
    expect(response.status).toBe(200);
    const logs = await pool.query(
      "SELECT username_input FROM public.login_logs",
    );
    expect(logs.rows.some((row) => row.username_input === phone)).toBe(false);
    expect(
      logs.rows.some((row) => row.username_input === "[手机号已脱敏]"),
    ).toBe(true);
  });
  it("停用、锁定、软删除账号不能登录", async () => {
    const passwordHash = await hasher.hash("123456");
    await drizzle(pool)
      .insert(users)
      .values([
        { username: "disabled", realName: "测试", passwordHash, status: 0 },
        {
          username: "locked",
          realName: "测试",
          passwordHash,
          lockedUntil: new Date(Date.now() + 1800000),
        },
        {
          username: "deleted",
          realName: "测试",
          passwordHash,
          deletedAt: new Date(),
        },
      ]);
    for (const [account, code] of [
      ["disabled", 10004],
      ["locked", 10003],
      ["deleted", 10001],
    ] as const) {
      const response = await login(account);
      expect(response.status).toBe(401);
      expect(apiResponseSchema.parse(await response.json()).code).toBe(code);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });
  it("拒绝格式无效请求", async () => {
    const response = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(400);
    expect(apiResponseSchema.parse(await response.json()).code).toBe(90001);
  });
  it("审计写入失败时会话和登录日志整体回滚", async () => {
    const before = await pool.query(
      "SELECT count(*)::int AS count FROM public.user_sessions",
    );
    const service = app.get(AuthService);
    await expect(
      service.login(
        { account: "demo", password: "123456" },
        { ip: "127.0.0.1", userAgent: "test", traceId: "bad-uuid" },
      ),
    ).rejects.toThrow();
    const after = await pool.query(
      "SELECT count(*)::int AS count FROM public.user_sessions",
    );
    expect(after.rows).toEqual(before.rows);
  });
});

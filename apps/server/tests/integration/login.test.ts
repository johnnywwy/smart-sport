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
import {
  IdentitiesRepository,
  IdentitiesService,
} from "../../src/modules/platform/identities/index.js";
import { importRegions } from "../../src/modules/platform/regions/region-importer.js";
import { requestContextMiddleware } from "../../src/request-context.js";
import { identities, organizations, users } from "../../src/schema/public.js";
import { SERVER_CONFIG } from "../../src/server-config.js";

let container: StartedPostgreSqlContainer | undefined;
let pool: pg.Pool;
let app: INestApplication;
let base: string;
const pair = generateKeyPairSync("ed25519");
const seedFile = new URL(
  "../../../../deploy/seed/regions.csv",
  import.meta.url,
);
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
  await importRegions(pool, seedFile);
  await drizzle(pool)
    .insert(users)
    .values({
      id: userId,
      username: "demo",
      email: "demo@example.test",
      realName: "测试",
      passwordHash: await hasher.hash("123456"),
    });
  const schoolOrgId = v7();
  await drizzle(pool).insert(organizations).values({
    id: schoolOrgId,
    type: "school",
    name: "测试学校",
    code: "ORG_LOGIN_TEST_SCHOOL",
    regionCode: "330106",
  });
  await drizzle(pool)
    .insert(identities)
    .values(
      ["school", "teacher", "student", "parent"].map((type) => ({
        userId,
        orgId: schoolOrgId,
        type,
      })),
    );
  const module = await Test.createTestingModule({
    imports: [ClsModule.forRoot({ global: true })],
    controllers: [AuthController],
    providers: [
      AuthService,
      AuthRepository,
      IdentitiesService,
      IdentitiesRepository,
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

function cookieValue(response: Response) {
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}
function sessionRequest(path: string, cookie: string) {
  return fetch(`${base}/api/v1/auth/${path}`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
}

function changePassword(
  cookie: string,
  accessToken: string,
  oldPassword: string,
  newPassword: string,
) {
  return fetch(`${base}/api/v1/auth/change-password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ oldPassword, newPassword }),
  });
}

async function loginSession(password: string) {
  const response = await login("demo", password);
  const body = successResponseSchema(loginResponseSchema).parse(
    await response.json(),
  );
  return {
    accessToken: body.data.accessToken,
    cookie: cookieValue(response),
  };
}

describe("refresh 轮换与退出", () => {
  it("刷新轮换 Cookie，保持会话 id 和账号阶段", async () => {
    const initial = await login("demo");
    const oldCookie = cookieValue(initial);
    const initialBody = successResponseSchema(loginResponseSchema).parse(
      await initial.json(),
    );
    const original = (
      await jwtVerify(initialBody.data.accessToken, pair.publicKey)
    ).payload;
    const response = await sessionRequest("refresh", oldCookie);
    expect(response.status).toBe(200);
    const body = apiResponseSchema.parse(await response.json());
    if (body.code !== 0) throw new Error("刷新失败");
    const token = (body.data as { accessToken: string }).accessToken;
    const payload = (await jwtVerify(token, pair.publicKey)).payload;
    expect(payload).toMatchObject({
      sid: original.sid,
      sub: userId,
      stage: "account",
    });
    expect(cookieValue(response)).not.toBe(oldCookie);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const history = await pool.query(
      "SELECT consumed_at FROM public.refresh_tokens WHERE session_id=$1",
      [original.sid],
    );
    expect(history.rowCount).toBe(2);
    expect(history.rows.filter((row) => row.consumed_at !== null)).toHaveLength(
      1,
    );
  });
  it("旧值重放吊销整个会话，新值随后也失效", async () => {
    const first = cookieValue(await login("demo"));
    const fresh = cookieValue(await sessionRequest("refresh", first));
    const replay = await sessionRequest("refresh", first);
    expect(replay.status).toBe(401);
    expect(cookieValue(replay)).toBe("refresh_token=");
    expect((await sessionRequest("refresh", fresh)).status).toBe(401);
  });
  it("并发刷新只有一个成功，重放分支提交吊销", async () => {
    const initial = cookieValue(await login("demo"));
    const responses = await Promise.all([
      sessionRequest("refresh", initial),
      sessionRequest("refresh", initial),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
    const successful = responses.find((r) => r.status === 200);
    if (!successful) throw new Error("没有成功刷新请求");
    expect(
      (await sessionRequest("refresh", cookieValue(successful))).status,
    ).toBe(401);
  });
  it("退出吊销会话、清理 Cookie 并记录审计，重复退出无副作用", async () => {
    const initial = cookieValue(await login("demo"));
    const response = await sessionRequest("logout", initial);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    const body = apiResponseSchema.parse(await response.json());
    const audit = await pool.query(
      "SELECT action FROM public.audit_logs WHERE trace_id=$1",
      [body.traceId],
    );
    expect(audit.rows).toEqual([{ action: "auth.logout" }]);
    expect((await sessionRequest("refresh", initial)).status).toBe(401);
    expect((await sessionRequest("logout", initial)).status).toBe(200);
  });
  it("缺失、重复或伪造 Cookie 不能刷新，无凭据退出可重试", async () => {
    for (const cookie of [
      "",
      "refresh_token=invalid",
      `refresh_token=${"a".repeat(43)}`,
      `refresh_token=${"b".repeat(43)}; refresh_token=${"c".repeat(43)}`,
    ]) {
      expect((await sessionRequest("refresh", cookie)).status).toBe(401);
    }
    expect((await sessionRequest("logout", "")).status).toBe(200);
  });
  it("会话过期与账号版本变更均使刷新失效", async () => {
    for (const invalidate of ["expiry", "version"]) {
      const response = await login("demo");
      const cookie = cookieValue(response);
      const body = successResponseSchema(loginResponseSchema).parse(
        await response.json(),
      );
      const payload = (await jwtVerify(body.data.accessToken, pair.publicKey))
        .payload;
      if (invalidate === "expiry")
        await pool.query(
          "UPDATE public.user_sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
          [payload.sid],
        );
      else
        await pool.query(
          "UPDATE public.users SET token_version=token_version+1 WHERE id=$1",
          [userId],
        );
      expect((await sessionRequest("refresh", cookie)).status).toBe(401);
    }
  });
  it("已选择身份的会话刷新返回 30 分钟身份级令牌", async () => {
    const response = await login("demo");
    const cookie = cookieValue(response);
    const body = successResponseSchema(loginResponseSchema).parse(
      await response.json(),
    );
    const payload = (await jwtVerify(body.data.accessToken, pair.publicKey))
      .payload;
    const identity = await pool.query(
      "SELECT id FROM public.identities WHERE user_id=$1 AND type='school'",
      [userId],
    );
    await pool.query(
      "UPDATE public.user_sessions SET identity_id=$1 WHERE id=$2",
      [identity.rows[0].id, payload.sid],
    );
    const refreshed = await sessionRequest("refresh", cookie);
    const result = apiResponseSchema.parse(await refreshed.json());
    expect(refreshed.status).toBe(200);
    const claims = (
      await jwtVerify(
        (result.data as { accessToken: string }).accessToken,
        pair.publicKey,
      )
    ).payload;
    expect(claims).toMatchObject({
      stage: "identity",
      iid: identity.rows[0].id,
    });
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(1800);
  });
});

describe("修改密码与强制改密", () => {
  it("修改密码升级账号版本、保留当前会话并吊销其他会话", async () => {
    const current = await loginSession("123456");
    const other = cookieValue(await login("demo"));
    const response = await changePassword(
      current.cookie,
      current.accessToken,
      "123456",
      "Sport2026",
    );
    expect(response.status).toBe(200);
    expect(apiResponseSchema.parse(await response.json())).toMatchObject({
      code: 0,
      data: null,
    });

    const refreshed = await sessionRequest("refresh", current.cookie);
    expect(refreshed.status).toBe(200);
    const refreshedBody = apiResponseSchema.parse(await refreshed.json());
    const accessToken = (refreshedBody.data as { accessToken: string })
      .accessToken;
    const claims = (await jwtVerify(accessToken, pair.publicKey)).payload;
    expect(claims.tv).toBeGreaterThan(0);
    expect((await sessionRequest("refresh", other)).status).toBe(401);

    expect((await login("demo", "123456")).status).toBe(401);
    const relogin = await login("demo", "Sport2026");
    expect(relogin.status).toBe(200);
    expect(
      successResponseSchema(loginResponseSchema).parse(await relogin.json())
        .data.mustChangePassword,
    ).toBe(false);

    const account = await pool.query(
      "SELECT password_changed_at, must_change_password, token_version FROM public.users WHERE id=$1",
      [userId],
    );
    expect(account.rows[0].password_changed_at).toBeInstanceOf(Date);
    expect(account.rows[0].must_change_password).toBe(false);
    const audit = await pool.query(
      "SELECT changes FROM public.audit_logs WHERE action='auth.password.change' AND user_id=$1 ORDER BY created_at DESC LIMIT 1",
      [userId],
    );
    expect(audit.rows).toEqual([{ changes: { password: "已修改" } }]);
  });

  it("旧密码错误不改密、不吊销其他会话且不写密码审计", async () => {
    const current = await loginSession("Sport2026");
    const other = cookieValue(await login("demo", "Sport2026"));
    const before = await pool.query(
      "SELECT count(*)::int AS count FROM public.audit_logs WHERE action='auth.password.change'",
    );
    const response = await changePassword(
      current.cookie,
      current.accessToken,
      "wrong",
      "Sport2027",
    );
    expect(response.status).toBe(401);
    expect(apiResponseSchema.parse(await response.json()).code).toBe(10001);
    expect((await sessionRequest("refresh", current.cookie)).status).toBe(200);
    expect((await sessionRequest("refresh", other)).status).toBe(200);
    const after = await pool.query(
      "SELECT count(*)::int AS count FROM public.audit_logs WHERE action='auth.password.change'",
    );
    expect(after.rows).toEqual(before.rows);
  });

  it("拒绝与当前及最近 3 次相同的密码", async () => {
    let password = "Sport2026";
    const previous = [password];
    for (const next of ["Sport2027", "Sport2028", "Sport2029"]) {
      const session = await loginSession(password);
      expect(
        (
          await changePassword(
            session.cookie,
            session.accessToken,
            password,
            next,
          )
        ).status,
      ).toBe(200);
      password = next;
      previous.push(password);
    }
    const current = await loginSession(password);
    for (const reused of previous.slice(-3)) {
      const response = await changePassword(
        current.cookie,
        current.accessToken,
        password,
        reused,
      );
      expect(response.status).toBe(400);
      const body = apiResponseSchema.parse(await response.json());
      expect(body.code).toBe(10006);
      expect(body.data).toMatchObject({
        fields: { newPassword: ["不能与最近 3 次密码相同"] },
      });
    }
  });

  it("测试环境允许默认密码，但仍禁止与用户名相同", async () => {
    const currentPassword = "Sport2029";
    const current = await loginSession(currentPassword);
    expect(
      (
        await changePassword(
          current.cookie,
          current.accessToken,
          currentPassword,
          "123456",
        )
      ).status,
    ).toBe(200);
    const next = await loginSession("123456");
    const response = await changePassword(
      next.cookie,
      next.accessToken,
      "123456",
      "demo",
    );
    expect(response.status).toBe(400);
    expect(apiResponseSchema.parse(await response.json()).data).toMatchObject({
      fields: { newPassword: ["不能与用户名相同"] },
    });
  });

  it("缺失、伪造或已吊销 Cookie 不能修改密码", async () => {
    const valid = await loginSession("123456");
    for (const cookie of ["", `refresh_token=${"x".repeat(43)}`]) {
      const response = await changePassword(
        cookie,
        valid.accessToken,
        "123456",
        "Sport2030",
      );
      expect(response.status).toBe(401);
      expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    }
    await sessionRequest("logout", valid.cookie);
    expect(
      (
        await changePassword(
          valid.cookie,
          valid.accessToken,
          "123456",
          "Sport2030",
        )
      ).status,
    ).toBe(401);
  });

  it("缺失、伪造或其他会话的 access token 不能修改密码", async () => {
    const current = await loginSession("123456");
    const other = await loginSession("123456");
    for (const accessToken of ["", "invalid.token.value", other.accessToken]) {
      const response = await changePassword(
        current.cookie,
        accessToken,
        "123456",
        "Sport2030",
      );
      expect(response.status).toBe(401);
    }
  });
});

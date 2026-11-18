import "reflect-metadata";
import { generateKeyPairSync } from "node:crypto";
import { Controller, Get, type INestApplication, Inject } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { ServerConfig } from "@smart-sport/config/env";
import {
  apiResponseSchema,
  authSessionSchema,
  identityListSchema,
  loginResponseSchema,
  selectIdentityResponseSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { Redis } from "ioredis";
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
import { syncCatalog } from "../../src/modules/platform/catalog/catalog-sync.js";
import {
  IdentitiesController,
  IdentitiesRepository,
  IdentitiesService,
} from "../../src/modules/platform/identities/index.js";
import type { IdentityContext } from "../../src/modules/platform/identity-context/index.js";
import {
  ParamsRepository,
  ParamsService,
} from "../../src/modules/platform/params/index.js";
import { importRegions } from "../../src/modules/platform/regions/region-importer.js";
import { requestContextMiddleware } from "../../src/request-context.js";
import {
  identities,
  identityRoles,
  organizations,
  roles,
  users,
} from "../../src/schema/public.js";
import { SERVER_CONFIG } from "../../src/server-config.js";
import { authentication } from "../helpers/authentication.js";

@Controller("api/v1/auth")
class ContextProbeController {
  constructor(@Inject(ClsService) private readonly cls: ClsService) {}
  @Get("context-probe")
  read() {
    const context = this.cls.get<IdentityContext>("identityContext");
    return {
      userId: this.cls.get("userId"),
      sessionId: this.cls.get("sessionId"),
      identityId: this.cls.get("identityId"),
      orgId: context.orgId,
      permissionsAreMap: context.permissions instanceof Map,
    };
  }
}

let container: StartedPostgreSqlContainer | undefined;
let pool: pg.Pool;
let security: Awaited<ReturnType<typeof authentication>>;
let app: INestApplication;
let base: string;
const pair = generateKeyPairSync("ed25519");
const hasher = new PasswordHasher();
const config = {
  NODE_ENV: "test",
  JWT_PRIVATE_KEY: pair.privateKey
    .export({ format: "der", type: "pkcs8" })
    .toString("base64"),
  JWT_KEY_ID: "identities-test",
  STUDENT_HMAC_KEY: Buffer.alloc(32, 2).toString("base64"),
} as ServerConfig;
const seedFile = new URL(
  "../../../../deploy/seed/regions.csv",
  import.meta.url,
);

beforeAll(async () => {
  container = await new PostgreSqlContainer(
    "postgres:17.11-alpine3.23",
  ).start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await migratePublic(pool);
  await syncCatalog(pool);
  await importRegions(pool, seedFile);
  security = await authentication(config);
  const module = await Test.createTestingModule({
    imports: [ClsModule.forRoot({ global: true })],
    controllers: [AuthController, IdentitiesController, ContextProbeController],
    providers: [
      AuthRepository,
      ParamsRepository,
      ParamsService,
      AuthService,
      IdentitiesRepository,
      IdentitiesService,
      PasswordHasher,
      AccessTokenSigner,
      ...security.providers,
      { provide: DRIZZLE, useValue: drizzle(pool) },
      { provide: SERVER_CONFIG, useValue: security.config },
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
  await security?.stop();
  await pool?.end();
  await container?.stop();
}, 30000);

type SeedIdentity = {
  type: "company" | "bureau" | "agent" | "school" | "teacher" | "student";
  orgType: "company" | "bureau" | "agent" | "school";
  orgName: string;
  status?: number;
  orgStatus?: number;
  title?: string;
  sort?: number;
};

async function seedAccount(
  username: string,
  items: SeedIdentity[],
  mustChangePassword = false,
) {
  const db = drizzle(pool);
  const userId = v7();
  await db.insert(users).values({
    id: userId,
    username,
    realName: username,
    passwordHash: await hasher.hash("123456"),
    mustChangePassword,
  });
  const identityIds: string[] = [];
  for (const [index, item] of items.entries()) {
    const orgId = v7(),
      identityId = v7();
    await db.insert(organizations).values({
      id: orgId,
      type: item.orgType,
      name: item.orgName,
      code: `ORG_${v7().replaceAll("-", "")}`,
      regionCode:
        item.orgType === "company" || item.orgType === "agent"
          ? null
          : "330106",
      status: item.orgStatus ?? 1,
    });
    await db.insert(identities).values({
      id: identityId,
      userId,
      orgId,
      type: item.type,
      title: item.title,
      status: item.status ?? 1,
      sort: item.sort ?? index,
    });
    identityIds.push(identityId);
  }
  return { userId, identityIds };
}

async function login(username: string) {
  const response = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: username, password: "123456" }),
  });
  const body = successResponseSchema(loginResponseSchema).parse(
    await response.json(),
  );
  return { response, body };
}

function authRequest(
  path: string,
  accessToken: string,
  init: RequestInit = {},
) {
  return fetch(`${base}/api/v1/auth/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
}

describe("身份列表、自动选择与切换", () => {
  it("恢复上下文读取服务端会话当前身份，账号级会话不冒用上次身份", async () => {
    const seeded = await seedAccount("restore-session", [
      { type: "company", orgType: "company", orgName: "公司甲" },
      { type: "company", orgType: "company", orgName: "公司乙" },
    ]);
    const result = await login("restore-session");
    const before = await authRequest("session", result.body.data.accessToken);
    expect(before.status).toBe(200);
    expect(
      successResponseSchema(authSessionSchema).parse(await before.json()).data,
    ).toMatchObject({
      currentIdentity: null,
      identityCount: 2,
      mustChangePassword: false,
    });
    const selected = await authRequest(
      "select-identity",
      result.body.data.accessToken,
      {
        method: "POST",
        body: JSON.stringify({ identityId: seeded.identityIds[1] }),
      },
    );
    const selection = successResponseSchema(selectIdentityResponseSchema).parse(
      await selected.json(),
    ).data;
    const current = await authRequest("session", selection.accessToken);
    expect(current.status).toBe(200);
    expect(
      successResponseSchema(authSessionSchema).parse(await current.json()).data
        .currentIdentity?.id,
    ).toBe(seeded.identityIds[1]);
  });
  it("唯一 company 身份登录后自动选择并签发身份级令牌", async () => {
    const { userId, identityIds } = await seedAccount("admin-auto", [
      { type: "company", orgType: "company", orgName: "平台公司" },
    ]);
    const result = await login("admin-auto");
    expect(result.body.data).toMatchObject({
      identityCount: 1,
      selectedIdentity: {
        id: identityIds[0],
        type: "company",
        orgName: "平台公司",
        available: true,
        lastUsed: true,
      },
    });
    const claims = (
      await jwtVerify(result.body.data.accessToken, pair.publicKey)
    ).payload;
    expect(claims).toMatchObject({
      sub: userId,
      iid: identityIds[0],
      stage: "identity",
    });
    const session = await pool.query(
      "SELECT identity_id FROM public.user_sessions WHERE id=$1",
      [claims.sid],
    );
    expect(session.rows[0]?.identity_id).toBe(identityIds[0]);
    const account = await pool.query(
      "SELECT last_identity_id FROM public.users WHERE id=$1",
      [userId],
    );
    expect(account.rows[0]?.last_identity_id).toBe(identityIds[0]);
    const audit = await pool.query(
      "SELECT action, org_id FROM public.audit_logs WHERE action='identity.select' AND user_id=$1",
      [userId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.org_id).not.toBeNull();
  });

  it("强制改密时不自动选择身份", async () => {
    await seedAccount(
      "admin-change",
      [{ type: "company", orgType: "company", orgName: "待改密平台" }],
      true,
    );
    const result = await login("admin-change");
    expect(result.body.data).toMatchObject({
      mustChangePassword: true,
      identityCount: 1,
      selectedIdentity: null,
    });
    const claims = (
      await jwtVerify(result.body.data.accessToken, pair.publicKey)
    ).payload;
    expect(claims.stage).toBe("account");
    expect(claims).not.toHaveProperty("iid");
  });

  it("多身份按组织类型分组，上次使用置顶，并返回角色 id", async () => {
    const seeded = await seedAccount("multi-user", [
      { type: "agent", orgType: "agent", orgName: "乙代理商", sort: 2 },
      { type: "company", orgType: "company", orgName: "平台公司", sort: 1 },
      {
        type: "teacher",
        orgType: "school",
        orgName: "西湖学校",
        title: "体育教师",
        sort: 3,
      },
      { type: "student", orgType: "school", orgName: "学生学校", sort: 4 },
      {
        type: "bureau",
        orgType: "bureau",
        orgName: "停用身份教育局",
        status: 0,
        sort: 5,
      },
      {
        type: "bureau",
        orgType: "bureau",
        orgName: "停用组织教育局",
        orgStatus: 0,
        sort: 6,
      },
    ]);
    const [role] = await drizzle(pool)
      .select({ id: roles.id })
      .from(roles)
      .limit(1);
    const roleId = role?.id ?? "";
    await drizzle(pool)
      .insert(identityRoles)
      .values({
        identityId: seeded.identityIds[0] ?? "",
        roleId,
      });
    await pool.query(
      "UPDATE public.users SET last_identity_id=$1 WHERE id=$2",
      [seeded.identityIds[0], seeded.userId],
    );
    const result = await login("multi-user");
    expect(result.body.data.selectedIdentity).toBeNull();
    expect(result.body.data.identityCount).toBe(3);
    const response = await authRequest(
      "identities",
      result.body.data.accessToken,
    );
    const body = successResponseSchema(identityListSchema).parse(
      await response.json(),
    );
    expect(body.data.groups.map((group) => group.type)).toEqual([
      "company",
      "bureau",
      "agent",
      "school",
    ]);
    expect(body.data).toMatchObject({ total: 6, availableCount: 3 });
    expect(body.data.groups[2]?.items[0]).toMatchObject({
      id: seeded.identityIds[0],
      lastUsed: true,
      roleIds: [roleId],
    });
    expect(
      body.data.groups[1]?.items.map((item) => item.unavailableReason),
    ).toEqual(["身份已停用", "组织已停用"]);
    expect(body.data.groups[3]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "teacher",
          typeName: "教师",
          available: true,
        }),
        expect.objectContaining({
          type: "student",
          available: false,
          unavailableReason: "该身份暂不支持登录后台",
        }),
      ]),
    );
  });

  it("选择身份更新会话与上次身份并返回 30 分钟身份令牌", async () => {
    const seeded = await seedAccount("switch-user", [
      { type: "company", orgType: "company", orgName: "平台公司" },
      { type: "agent", orgType: "agent", orgName: "切换代理商" },
    ]);
    const loginResult = await login("switch-user");
    const original = (
      await jwtVerify(loginResult.body.data.accessToken, pair.publicKey)
    ).payload;
    const response = await authRequest(
      "select-identity",
      loginResult.body.data.accessToken,
      {
        method: "POST",
        body: JSON.stringify({ identityId: seeded.identityIds[1] }),
      },
    );
    expect(response.status).toBe(201);
    const body = successResponseSchema(selectIdentityResponseSchema).parse(
      await response.json(),
    );
    expect(body.data.identity).toMatchObject({
      id: seeded.identityIds[1],
      type: "agent",
      lastUsed: true,
    });
    const claims = (await jwtVerify(body.data.accessToken, pair.publicKey))
      .payload;
    expect(claims).toMatchObject({
      sid: original.sid,
      iid: seeded.identityIds[1],
      stage: "identity",
    });
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(1800);
    const session = await pool.query(
      "SELECT identity_id FROM public.user_sessions WHERE id=$1",
      [original.sid],
    );
    expect(session.rows[0]?.identity_id).toBe(seeded.identityIds[1]);
  });

  it("选择不存在、停用、组织停用和学生身份返回精确错误码", async () => {
    const seeded = await seedAccount("invalid-select", [
      { type: "company", orgType: "company", orgName: "可用平台" },
      { type: "agent", orgType: "agent", orgName: "停用身份", status: 0 },
      { type: "bureau", orgType: "bureau", orgName: "停用组织", orgStatus: 0 },
      { type: "student", orgType: "school", orgName: "学生学校" },
    ]);
    const loginResult = await login("invalid-select");
    for (const [identityId, code] of [
      [v7(), 11001],
      [seeded.identityIds[1], 11002],
      [seeded.identityIds[2], 11003],
      [seeded.identityIds[3], 11004],
    ] as const) {
      const response = await authRequest(
        "select-identity",
        loginResult.body.data.accessToken,
        {
          method: "POST",
          body: JSON.stringify({ identityId }),
        },
      );
      expect(apiResponseSchema.parse(await response.json()).code).toBe(code);
    }
  });

  it("身份级令牌也可列出身份并切换，其他账号身份返回 11001", async () => {
    const first = await seedAccount("identity-token", [
      { type: "company", orgType: "company", orgName: "平台一" },
      { type: "agent", orgType: "agent", orgName: "代理一" },
    ]);
    const other = await seedAccount("other-user", [
      { type: "company", orgType: "company", orgName: "平台二" },
    ]);
    const loginResult = await login("identity-token");
    const selectedResponse = await authRequest(
      "select-identity",
      loginResult.body.data.accessToken,
      {
        method: "POST",
        body: JSON.stringify({ identityId: first.identityIds[0] }),
      },
    );
    const selected = successResponseSchema(selectIdentityResponseSchema).parse(
      await selectedResponse.json(),
    );
    const listResponse = await authRequest(
      "identities",
      selected.data.accessToken,
    );
    const list = successResponseSchema(identityListSchema).parse(
      await listResponse.json(),
    );
    expect(list.data.total).toBe(2);
    const forbidden = await authRequest(
      "select-identity",
      selected.data.accessToken,
      {
        method: "POST",
        body: JSON.stringify({ identityId: other.identityIds[0] }),
      },
    );
    expect(apiResponseSchema.parse(await forbidden.json()).code).toBe(11001);
  });
});

describe("T-029 全局鉴权与身份上下文", () => {
  it("未选身份的账号令牌能列身份但访问业务接口返回401", async () => {
    await seedAccount("guard-account", []);
    const { body } = await login("guard-account");
    expect(
      (await authRequest("identities", body.data.accessToken)).status,
    ).toBe(200);
    expect(
      (await authRequest("context-probe", body.data.accessToken)).status,
    ).toBe(401);
  });

  it("身份令牌写入完整CLS上下文，另一标签页切换后旧令牌返回11005", async () => {
    const { userId, identityIds } = await seedAccount("guard-tabs", [
      { type: "company", orgType: "company", orgName: "公司一" },
      { type: "company", orgType: "company", orgName: "公司二" },
    ]);
    const { body } = await login("guard-tabs");
    const select = async (token: string, id: string) => {
      const result = await authRequest("select-identity", token, {
        method: "POST",
        body: JSON.stringify({ identityId: id }),
      });
      expect(result.status).toBe(201);
      return selectIdentityResponseSchema.parse(
        apiResponseSchema.parse(await result.json()).data,
      ).accessToken;
    };
    const first = await select(body.data.accessToken, identityIds[0] ?? "");
    const initial = await authRequest("context-probe", first);
    expect(initial.status).toBe(200);
    expect(apiResponseSchema.parse(await initial.json()).data).toMatchObject({
      userId,
      identityId: identityIds[0],
      permissionsAreMap: true,
    });
    const second = await select(first, identityIds[1] ?? "");
    const stale = await authRequest("context-probe", first);
    expect(stale.status).toBe(401);
    expect(apiResponseSchema.parse(await stale.json()).code).toBe(11005);
    const current = await authRequest("context-probe", second);
    expect(current.status).toBe(200);
    expect(apiResponseSchema.parse(await current.json()).data).toMatchObject({
      userId,
      identityId: identityIds[1],
    });
    const claims = await app.get(AccessTokenSigner).verify(second);
    const inspector = new Redis(security.config.REDIS_URL);
    try {
      const raw = await inspector.get(`session:${claims?.sessionId}`);
      expect(raw).toBeTruthy();
      expect(Object.keys(JSON.parse(raw ?? "{}")).sort()).toEqual([
        "expiresAt",
        "id",
        "identityId",
        "userId",
      ]);
    } finally {
      inspector.disconnect();
    }
    const oldList = await authRequest("identities", first);
    expect(apiResponseSchema.parse(await oldList.json()).code).toBe(11005);
  });

  it.each(["revoked", "expired", "version", "disabled"])(
    "会话或账号%s后旧令牌立即失效",
    async (mode) => {
      const { userId } = await seedAccount(`guard-${mode}`, [
        { type: "company", orgType: "company", orgName: "测试公司" },
      ]);
      const { body } = await login(`guard-${mode}`);
      const token = body.data.accessToken;
      expect((await authRequest("context-probe", token)).status).toBe(200);
      if (mode === "revoked")
        await pool.query(
          "UPDATE public.user_sessions SET revoked_at=now() WHERE user_id=$1",
          [userId],
        );
      if (mode === "expired")
        await pool.query(
          "UPDATE public.user_sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",
          [userId],
        );
      if (mode === "version")
        await pool.query(
          "UPDATE public.users SET token_version=token_version+1 WHERE id=$1",
          [userId],
        );
      if (mode === "disabled")
        await pool.query("UPDATE public.users SET status=0 WHERE id=$1", [
          userId,
        ]);
      const denied = await authRequest("context-probe", token);
      expect(denied.status).toBe(401);
      expect(apiResponseSchema.parse(await denied.json()).code).toBe(10005);
    },
  );

  it("真实退出接口吊销会话后原access令牌不能继续使用", async () => {
    const seeded = await seedAccount("guard-logout", [
      { type: "company", orgType: "company", orgName: "退出测试" },
    ]);
    const { response, body } = await login("guard-logout");
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toBeTruthy();
    const logout = await fetch(`${base}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie ?? "" },
    });
    expect(logout.status).toBe(200);
    const trace = apiResponseSchema.parse(await logout.json()).traceId;
    const expected = (
      await pool.query("SELECT org_id FROM public.identities WHERE id=$1", [
        seeded.identityIds[0],
      ])
    ).rows[0];
    const audit = (
      await pool.query(
        "SELECT user_id,identity_id,org_id FROM public.audit_logs WHERE trace_id=$1 AND action='auth.logout'",
        [trace],
      )
    ).rows;
    expect(audit).toEqual([
      {
        user_id: seeded.userId,
        identity_id: seeded.identityIds[0],
        org_id: expected.org_id,
      },
    ]);
    const denied = await authRequest("context-probe", body.data.accessToken);
    expect(denied.status).toBe(401);
    expect(apiResponseSchema.parse(await denied.json()).code).toBe(10005);
  });

  it("伪造另一个账号会话和身份的有效签名仍不能越权", async () => {
    const owner = await seedAccount("guard-owner", [
      { type: "company", orgType: "company", orgName: "公司甲" },
    ]);
    const other = await seedAccount("guard-other", [
      { type: "company", orgType: "company", orgName: "公司乙" },
    ]);
    const { body } = await login("guard-owner");
    const claims = await app
      .get(AccessTokenSigner)
      .verify(body.data.accessToken);
    if (!claims) throw new Error("缺少测试令牌");
    const forged = await app.get(AccessTokenSigner).signIdentity({
      ...claims,
      userId: other.userId,
      identityId: owner.identityIds[0] ?? "",
    });
    const denied = await authRequest("context-probe", forged);
    expect(denied.status).toBe(401);
    expect(apiResponseSchema.parse(await denied.json()).code).toBe(10005);
    const missing = await app.get(AccessTokenSigner).signIdentity({
      ...claims,
      sessionId: v7(),
      identityId: owner.identityIds[0] ?? "",
    });
    expect((await authRequest("context-probe", missing)).status).toBe(401);
  });
});

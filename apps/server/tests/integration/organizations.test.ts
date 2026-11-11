import "reflect-metadata";
import { generateKeyPairSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { ServerConfig } from "@smart-sport/config/env";
import {
  apiResponseSchema,
  organizationListSchema,
  organizationSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { ClsModule, ClsService } from "nestjs-cls";
import pg from "pg";
import { v7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ApiExceptionFilter,
  ApiResponseInterceptor,
} from "../../src/api-response.js";
import {
  ACCESS_TOKEN_VERIFIER,
  AuthenticatedGuard,
} from "../../src/core/authenticated.guard.js";
import { migratePublic } from "../../src/database/migrate.js";
import { DRIZZLE } from "../../src/database/registry.js";
import { AccessTokenSigner } from "../../src/infra/auth/access-token-signer.js";
import {
  CompanyOrganizationGuard,
  OrganizationsController,
  OrganizationsRepository,
  OrganizationsService,
} from "../../src/modules/platform/organizations/index.js";
import { importRegions } from "../../src/modules/platform/regions/region-importer.js";
import { requestContextMiddleware } from "../../src/request-context.js";
import { identities, organizations, users } from "../../src/schema/public.js";
import { SERVER_CONFIG } from "../../src/server-config.js";

let container: StartedPostgreSqlContainer | undefined;
let pool: pg.Pool;
let app: INestApplication;
let base: string;
let companyToken: string;
let bureauToken: string;
let accountToken: string;
const companyUserId = v7();
const companyOrgId = v7();
const companyIdentityId = v7();
const bureauOrgId = v7();
const bureauIdentityId = v7();
const seedFile = fileURLToPath(
  new URL("../../../../deploy/seed/regions.csv", import.meta.url),
);
const pair = generateKeyPairSync("ed25519");
const config = {
  NODE_ENV: "test",
  JWT_PRIVATE_KEY: pair.privateKey
    .export({ format: "der", type: "pkcs8" })
    .toString("base64"),
  JWT_KEY_ID: "organizations-test",
} as ServerConfig;

beforeAll(async () => {
  container = await new PostgreSqlContainer(
    "postgres:17.11-alpine3.23",
  ).start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await migratePublic(pool);
  await importRegions(pool, seedFile);
  const db = drizzle(pool);
  await db.insert(users).values({
    id: companyUserId,
    username: "company-admin",
    realName: "公司管理员",
    passwordHash: "test-only",
    mustChangePassword: false,
  });
  await db.insert(organizations).values([
    {
      id: companyOrgId,
      type: "company",
      name: "智慧体育云平台",
      code: "ORG_COMPANY_TEST",
    },
    {
      id: bureauOrgId,
      type: "bureau",
      name: "测试教育局",
      code: "ORG_BUREAU_TEST",
      regionCode: "330000",
    },
  ]);
  await db.insert(identities).values([
    {
      id: companyIdentityId,
      userId: companyUserId,
      orgId: companyOrgId,
      type: "company",
    },
    {
      id: bureauIdentityId,
      userId: companyUserId,
      orgId: bureauOrgId,
      type: "bureau",
    },
  ]);

  const module = await Test.createTestingModule({
    imports: [ClsModule.forRoot({ global: true })],
    controllers: [OrganizationsController],
    providers: [
      OrganizationsRepository,
      OrganizationsService,
      AuthenticatedGuard,
      CompanyOrganizationGuard,
      AccessTokenSigner,
      { provide: ACCESS_TOKEN_VERIFIER, useExisting: AccessTokenSigner },
      { provide: DRIZZLE, useValue: db },
      { provide: SERVER_CONFIG, useValue: config },
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
      { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
    ],
  }).compile();
  app = module.createNestApplication();
  app.use(requestContextMiddleware(app.get(ClsService)));
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  const signer = app.get(AccessTokenSigner);
  const tokenInput = {
    userId: companyUserId,
    sessionId: v7(),
    tokenVersion: 0,
  };
  companyToken = await signer.signIdentity({
    ...tokenInput,
    identityId: companyIdentityId,
  });
  bureauToken = await signer.signIdentity({
    ...tokenInput,
    identityId: bureauIdentityId,
  });
  accountToken = await signer.signAccount(tokenInput);
}, 120000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await container?.stop();
}, 30000);

function request(path: string, init: RequestInit = {}, token = companyToken) {
  return fetch(`${base}/api/v1/orgs${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

async function createOrganization(body: unknown) {
  const response = await request("", {
    method: "POST",
    headers: { "Idempotency-Key": v7() },
    body: JSON.stringify(body),
  });
  return {
    response,
    body: successResponseSchema(organizationSchema).parse(
      await response.json(),
    ),
  };
}

describe("公司身份管理教育局与代理商", () => {
  it("账号级令牌、非公司身份和未登录请求均被拒绝", async () => {
    expect((await request("", {}, "")).status).toBe(401);
    for (const token of [accountToken, bureauToken]) {
      const response = await request("", {}, token);
      expect(response.status).toBe(403);
      expect(apiResponseSchema.parse(await response.json()).code).toBe(11101);
    }
  });

  it("创建教育局和无注册地区划的代理商，并写入审计", async () => {
    const bureau = await createOrganization({
      type: "bureau",
      name: "杭州市教育局",
      regionCode: "330100",
    });
    expect(bureau.response.status).toBe(201);
    expect(bureau.body.data).toMatchObject({
      type: "bureau",
      name: "杭州市教育局",
      regionCode: "330100",
      regionName: "杭州市",
      status: 1,
      version: 0,
      allowedActions: ["update", "toggle"],
    });

    const agent = await createOrganization({
      type: "agent",
      name: "全国测试代理商",
    });
    expect(agent.body.data).toMatchObject({
      type: "agent",
      regionCode: null,
      regionName: null,
    });
    const audit = await pool.query(
      "SELECT action, identity_id, changes FROM public.audit_logs WHERE target_id=$1",
      [bureau.body.data.id],
    );
    expect(audit.rows[0]).toMatchObject({
      action: "organization.create",
      identity_id: companyIdentityId,
    });
  });

  it("拒绝学校类型、教育局缺少区划和不存在的区划", async () => {
    for (const input of [
      { type: "school", name: "测试学校", regionCode: "330106" },
      { type: "bureau", name: "无区划教育局" },
      { type: "agent", name: "错误区划代理商", regionCode: "999999" },
    ]) {
      const response = await request("", {
        method: "POST",
        headers: { "Idempotency-Key": v7() },
        body: JSON.stringify(input),
      });
      expect(response.status).toBe(400);
      expect(apiResponseSchema.parse(await response.json()).code).toBe(90001);
    }
  });

  it("按类型、关键字和区划分页筛选，且不返回内部编码", async () => {
    const response = await request(
      "?type=bureau&keyword=杭州&regionCode=330100&page=1&pageSize=10",
    );
    expect(response.status).toBe(200);
    const body = successResponseSchema(organizationListSchema).parse(
      await response.json(),
    );
    expect(body.data.total).toBe(1);
    expect(body.data.items[0]).toMatchObject({
      name: "杭州市教育局",
      regionName: "杭州市",
    });
    expect(body.data.items[0]).not.toHaveProperty("code");
  });

  it("修改与启停要求正确版本，旧版本返回 90002", async () => {
    const created = await createOrganization({
      type: "agent",
      name: "浙江测试代理商",
      regionCode: "330000",
    });
    const id = created.body.data.id;
    const update = await request(`/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: "杭州测试代理商",
        regionCode: "330100",
        version: 0,
      }),
    });
    const updated = successResponseSchema(organizationSchema).parse(
      await update.json(),
    );
    expect(updated.data).toMatchObject({
      name: "杭州测试代理商",
      regionName: "杭州市",
      version: 1,
    });

    const stale = await request(`/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: "旧版本修改",
        regionCode: "330100",
        version: 0,
      }),
    });
    expect(stale.status).toBe(409);
    expect(apiResponseSchema.parse(await stale.json()).code).toBe(90002);

    const toggle = await request(`/${id}/toggle`, {
      method: "POST",
      body: JSON.stringify({ enabled: false, version: 1 }),
    });
    const disabled = successResponseSchema(organizationSchema).parse(
      await toggle.json(),
    );
    expect(disabled.data).toMatchObject({ status: 0, version: 2 });
  });

  it("公司与学校不能通过普通组织接口修改或启停", async () => {
    for (const id of [companyOrgId, v7()]) {
      const response = await request(`/${id}/toggle`, {
        method: "POST",
        body: JSON.stringify({ enabled: false, version: 0 }),
      });
      expect(response.status).toBe(404);
      expect(apiResponseSchema.parse(await response.json()).code).toBe(90004);
    }
  });
});

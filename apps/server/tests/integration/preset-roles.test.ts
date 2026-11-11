import "reflect-metadata";
import { generateKeyPairSync } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { ServerConfig } from "@smart-sport/config/env";
import {
  apiResponseSchema,
  presetRoleImpactSchema,
  presetRoleListSchema,
  presetRoleSchema,
  type SavePresetRole,
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
import { migratePublic } from "../../src/database/migrate.js";
import { DRIZZLE } from "../../src/database/registry.js";
import { IdempotencyInterceptor } from "../../src/idempotency.js";
import { AccessTokenSigner } from "../../src/infra/auth/access-token-signer.js";
import { syncCatalog } from "../../src/modules/platform/catalog/catalog-sync.js";
import {
  PresetRolesController,
  PresetRolesRepository,
  PresetRolesService,
  TemplateReader,
} from "../../src/modules/platform/preset-roles/index.js";
import { requestContextMiddleware } from "../../src/request-context.js";
import { SERVER_CONFIG } from "../../src/server-config.js";
import { authentication } from "../helpers/authentication.js";

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let security: Awaited<ReturnType<typeof authentication>>;
let app: INestApplication;
let base: string;
let companyToken: string;
let emptyToken: string;
let teacherToken: string;
let accountToken: string;
const companyIdentity = v7();
const pair = generateKeyPairSync("ed25519");
const config = {
  NODE_ENV: "test",
  JWT_PRIVATE_KEY: pair.privateKey
    .export({ format: "der", type: "pkcs8" })
    .toString("base64"),
  JWT_KEY_ID: "navigation-test",
} as ServerConfig;

async function seed(
  type: "company" | "teacher",
  role: string | null,
  identityId = v7(),
) {
  const userId = v7(),
    orgId = v7(),
    sessionId = v7();
  await pool.query(
    "INSERT INTO public.users (id,username,real_name,password_hash,must_change_password) VALUES ($1,$2,'导航测试','test',false)",
    [userId, `nav-${userId}`],
  );
  await pool.query(
    "INSERT INTO public.orgs (id,type,name,code,region_code) VALUES ($1,$2,'导航测试组织',$3,$4)",
    [
      orgId,
      type === "teacher" ? "school" : "company",
      `NAV_${orgId}`,
      type === "teacher" ? "990000" : null,
    ],
  );
  await pool.query(
    "INSERT INTO public.identities (id,user_id,org_id,type) VALUES ($1,$2,$3,$4)",
    [identityId, userId, orgId, type],
  );
  await pool.query(
    "INSERT INTO public.user_sessions (id,user_id,identity_id,refresh_token_hash,client,expires_at) VALUES ($1,$2,$3,$4,'admin',now()+interval '1 day')",
    [sessionId, userId, identityId, sessionId.replaceAll("-", "").repeat(2)],
  );
  if (role)
    await pool.query(
      "INSERT INTO public.identity_roles (identity_id,role_id) SELECT $1,id FROM public.roles WHERE code=$2",
      [identityId, role],
    );
  const signer = app.get(AccessTokenSigner);
  return {
    token: await signer.signIdentity({
      userId,
      sessionId,
      identityId,
      tokenVersion: 0,
    }),
    account: await signer.signAccount({ userId, sessionId, tokenVersion: 0 }),
  };
}
beforeAll(async () => {
  postgres = await new PostgreSqlContainer("postgres:17.11-alpine3.23").start();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await migratePublic(pool);
  await syncCatalog(pool);
  await pool.query(
    "INSERT INTO public.regions (code,name,level,path) VALUES ('990000','测试省',1,'990000')",
  );
  security = await authentication(config);
  const module = await Test.createTestingModule({
    imports: [ClsModule.forRoot({ global: true })],
    controllers: [PresetRolesController],
    providers: [
      ...security.providers,
      PresetRolesRepository,
      PresetRolesService,
      TemplateReader,
      { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
      AccessTokenSigner,
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
  const company = await seed("company", "company-super-admin", companyIdentity);
  companyToken = company.token;
  accountToken = company.account;
  emptyToken = (await seed("company", null)).token;
  teacherToken = (await seed("teacher", "teacher-pe")).token;
}, 120000);
afterAll(async () => {
  await app?.close();
  await security?.stop();
  await pool?.end();
  await postgres?.stop();
}, 30000);

const request = (
  path: string,
  token = companyToken,
  method = "GET",
  body?: unknown,
) =>
  fetch(`${base}/api/v1/preset-roles${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": v7(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

async function template(name = "销售") {
  const response = await request("");
  expect(response.status).toBe(200);
  const rows = successResponseSchema(presetRoleListSchema).parse(
    await response.json(),
  ).data;
  const row = rows.find((r) => r.name === name);
  if (!row) throw new Error("测试模板不存在");
  return row;
}
function payload(row: Awaited<ReturnType<typeof template>>): SavePresetRole {
  return {
    version: row.version,
    dataScope: row.dataScope,
    remark: row.remark,
    grants: row.grants.map(({ app, feature, grant }) => ({
      app,
      feature,
      grant,
    })),
  };
}
describe("平台内置角色模板管理", () => {
  it("查询默认模板、逐项标记与超级管理员保护", async () => {
    expect((await template()).modified).toBe(false);
    const admin = await template("超级管理员");
    expect(admin.editable).toBe(false);
    expect(admin.allowedActions).toEqual([]);
    const r = await request(
      `/${admin.id}`,
      companyToken,
      "PUT",
      payload(admin),
    );
    expect(r.status).toBe(403);
    expect(apiResponseSchema.parse(await r.json()).code).toBe(11105);
  });
  it("四个接口均拒绝缺权限及账号级令牌，其他组织不能查询", async () => {
    const row = await template();
    for (const [path, method, body] of [
      ["", "GET", undefined],
      [`/${row.id}`, "PUT", payload(row)],
      [`/${row.id}/impact`, "POST", payload(row)],
      [`/${row.id}/reset`, "POST", { version: row.version }],
    ] as const) {
      expect((await request(path, emptyToken, method, body)).status).toBe(403);
      expect((await request(path, accountToken, method, body)).status).toBe(
        401,
      );
      expect((await request(path, teacherToken, method, body)).status).toBe(
        403,
      );
    }
  });
  it("研发默认只能查看模板，不能保存或恢复", async () => {
    const developer = (await seed("company", "company-developer")).token;
    const r = await request("", developer);
    const rows = successResponseSchema(presetRoleListSchema).parse(
      await r.json(),
    ).data;
    expect(rows.every((row) => !row.editable)).toBe(true);
    const row = await template();
    expect(
      (await request(`/${row.id}`, developer, "PUT", payload(row))).status,
    ).toBe(403);
    expect(
      (
        await request(`/${row.id}/reset`, developer, "POST", {
          version: row.version,
        })
      ).status,
    ).toBe(403);
  });
  it("影响范围包含派生角色并去重，预览不写入", async () => {
    const row = await template();
    await seed("company", "company-sales");
    const assigned = await pool.query<{ identity_id: string; org_id: string }>(
      `SELECT ir.identity_id,i.org_id FROM public.identity_roles ir JOIN public.identities i ON i.id=ir.identity_id WHERE ir.role_id=$1 LIMIT 1`,
      [row.id],
    );
    const customId = v7();
    await pool.query(
      `INSERT INTO public.roles(id,kind,base_role_id,identity_type,org_id,code,name,data_scope) VALUES($1,'custom',$2,'company',$3,$4,'测试派生','personal')`,
      [customId, row.id, assigned.rows[0]?.org_id, customId],
    );
    await pool.query(
      "INSERT INTO public.identity_roles(identity_id,role_id) VALUES($1,$2)",
      [assigned.rows[0]?.identity_id, customId],
    );
    await pool.query(
      "INSERT INTO public.role_grants(role_id,app_code,feature_code,level) VALUES($1,'system','param','none')",
      [customId],
    );
    const input = payload(row);
    input.grants = input.grants.map((g) =>
      g.app === "system" && g.feature === "param"
        ? { ...g, grant: { level: "view" } }
        : g,
    );
    const response = await request(
      `/${row.id}/impact`,
      companyToken,
      "POST",
      input,
    );
    expect(response.status).toBe(201);
    const impact = successResponseSchema(presetRoleImpactSchema).parse(
      await response.json(),
    ).data;
    expect(impact.identityCount).toBe(1);
    expect(impact.organizationCount).toBe(1);
    expect(impact.userCount).toBe(1);
    expect(impact.menuChanges).toHaveLength(1);
    expect((await template()).modified).toBe(false);
  });
  it("保存只存差异、同步保留覆盖；单项和整体恢复保留版本并写审计", async () => {
    const row = await template();
    const input = payload(row);
    input.dataScope = "personal";
    input.remark = "测试角色说明";
    input.grants = input.grants.map((g) =>
      g.app === "system" && g.feature === "param"
        ? { ...g, grant: { level: "view" } }
        : g,
    );
    let r = await request(`/${row.id}`, companyToken, "PUT", input);
    expect(r.status).toBe(200);
    const saved = successResponseSchema(presetRoleSchema).parse(
      await r.json(),
    ).data;
    expect(saved.version).toBe(row.version + 1);
    expect(saved.grants.filter((g) => g.modified)).toHaveLength(1);
    const stored = await pool.query(
      "SELECT grants FROM public.preset_role_overrides WHERE role_id=$1",
      [row.id],
    );
    expect(stored.rows[0].grants).toHaveLength(1);
    expect(
      (await request(`/${row.id}`, companyToken, "PUT", input)).status,
    ).toBe(409);
    await syncCatalog(pool);
    expect((await template()).remark).toBe("测试角色说明");
    r = await request(`/${row.id}/reset`, companyToken, "POST", {
      version: saved.version,
      feature: { app: "system", feature: "param" },
    });
    expect(r.status).toBe(201);
    const partial = successResponseSchema(presetRoleSchema).parse(
      await r.json(),
    ).data;
    expect(partial.dataScope).toBe("personal");
    expect(partial.grants.some((g) => g.modified)).toBe(false);
    r = await request(`/${row.id}/reset`, companyToken, "POST", {
      version: partial.version,
    });
    expect(r.status).toBe(201);
    const reset = successResponseSchema(presetRoleSchema).parse(
      await r.json(),
    ).data;
    expect(reset.modified).toBe(false);
    expect(reset.version).toBe(saved.version + 2);
    expect(
      (
        await pool.query(
          "SELECT * FROM public.preset_role_overrides WHERE role_id=$1",
          [row.id],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (await request(`/${row.id}`, companyToken, "PUT", input)).status,
    ).toBe(409);
    expect(
      (
        await pool.query(
          "SELECT * FROM public.audit_logs WHERE target_id=$1 AND action LIKE 'preset-role.%'",
          [row.id],
        )
      ).rowCount,
    ).toBe(3);
  });
  it("拒绝遗漏档位、未知细调动作与不支持的资源", async () => {
    const row = await template();
    expect(
      (
        await request(`/${row.id}`, companyToken, "PUT", {
          ...payload(row),
          grants: [],
        })
      ).status,
    ).toBe(400);
    expect(
      (await request(`/${v7()}`, companyToken, "PUT", payload(row))).status,
    ).toBe(404);
  });
});

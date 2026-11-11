import "reflect-metadata";
import { generateKeyPairSync } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import type { ServerConfig } from "@smart-sport/config/env";
import {
  apiResponseSchema,
  availableAppsSchema,
  currentMenusSchema,
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
import { AccessTokenSigner } from "../../src/infra/auth/access-token-signer.js";
import { syncCatalog } from "../../src/modules/platform/catalog/catalog-sync.js";
import {
  NavigationController,
  NavigationRepository,
  NavigationService,
} from "../../src/modules/platform/navigation/index.js";
import { requestContextMiddleware } from "../../src/request-context.js";
import { SERVER_CONFIG } from "../../src/server-config.js";
import { withZodSchemas } from "../../src/zod-route.js";
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
    controllers: [NavigationController],
    providers: [
      ...security.providers,
      NavigationRepository,
      NavigationService,
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
  const company = await seed("company", "company-developer", companyIdentity);
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
const request = (path: string, token = companyToken) =>
  fetch(`${base}/api/v1/${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
async function apps(token = companyToken) {
  const result = await request("apps/available", token);
  expect(result.status).toBe(200);
  return successResponseSchema(availableAppsSchema).parse(await result.json())
    .data;
}
async function menus(code: string, token = companyToken) {
  const result = await request(`menus/current?app=${code}`, token);
  expect(result.status).toBe(200);
  return successResponseSchema(currentMenusSchema).parse(await result.json())
    .data;
}

describe("当前身份的可用应用与菜单", () => {
  it("递归菜单的OpenAPI引用指向已注册组件", () => {
    const document = withZodSchemas(
      SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle("test").setVersion("1").build(),
      ),
    );
    const references: string[] = [];
    JSON.stringify(document, (key, value: unknown) => {
      if (key === "$ref" && typeof value === "string") references.push(value);
      return value;
    });
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference.startsWith("#/components/schemas/")).toBe(true);
      expect(
        document.components?.schemas?.[
          reference.replace("#/components/schemas/", "")
        ],
      ).toBeDefined();
    }
  });

  it("账号级令牌和未登录均不能读取导航", async () => {
    for (const token of [accountToken, ""])
      for (const path of ["apps/available", "menus/current?app=system"]) {
        expect((await request(path, token)).status).toBe(401);
      }
  });
  it("研发仅看到已授权应用，不返回组织权限菜单", async () => {
    expect((await apps()).map(({ code }) => code)).toEqual([
      "system",
      "platform",
      "ops",
      "school",
    ]);
    expect((await menus("platform")).map(({ key }) => key)).toEqual([
      "org",
      "onboarding",
      "subscription",
      "grant",
    ]);
    expect(await menus("org")).toEqual([]);
  });
  it("无角色身份返回空应用和空菜单，不沿用前一个身份权限", async () => {
    expect(await apps(emptyToken)).toEqual([]);
    expect(await menus("system", emptyToken)).toEqual([]);
    expect((await apps()).length).toBe(4);
  });
  it("教师只能看到学校应用和获授模块", async () => {
    expect((await apps(teacherToken)).map(({ code }) => code)).toEqual([
      "school",
    ]);
    expect(
      (await menus("school", teacherToken)).map(({ key }) => key).sort(),
    ).toEqual(["class", "student", "teaching-class"]);
    expect(await menus("system", teacherToken)).toEqual([]);
  });
  it("身份类型限制不因错误配置的跨应用授权而放宽", async () => {
    await pool.query(
      "INSERT INTO public.role_grants (role_id,app_code,feature_code,level) SELECT id,'system','dict','view' FROM public.roles WHERE code='teacher-pe'",
    );
    try {
      expect((await apps(teacherToken)).map(({ code }) => code)).toEqual([
        "school",
      ]);
      expect(await menus("system", teacherToken)).toEqual([]);
    } finally {
      await syncCatalog(pool);
    }
  });
  it("缺少或未知应用参数返回400", async () => {
    for (const path of ["menus/current", "menus/current?app=unknown"]) {
      const response = await request(path);
      expect(response.status).toBe(400);
      expect(apiResponseSchema.parse(await response.json()).code).toBe(90001);
    }
  });
  it("用户菜单覆盖修改名称、图标、排序和显隐，目录同步后仍保留", async () => {
    await pool.query(
      "INSERT INTO public.menu_overrides (app_code,menu_key,display_name,icon,sort) VALUES ('platform','subscription','我的服务','star',0)",
    );
    await pool.query(
      "INSERT INTO public.menu_overrides (app_code,menu_key,hidden) VALUES ('platform','org',true)",
    );
    try {
      await syncCatalog(pool);
      const items = await menus("platform");
      expect(items[0]).toMatchObject({
        key: "subscription",
        name: "我的服务",
        icon: "star",
        sort: 0,
      });
      expect(items.some(({ key }) => key === "org")).toBe(false);
    } finally {
      await pool.query("DELETE FROM public.menu_overrides");
    }
  });
  it("下线应用、功能和菜单不返回，隐藏父节点也隐藏其后代", async () => {
    await pool.query("UPDATE public.apps SET status=0 WHERE code='system'");
    await pool.query(
      "UPDATE public.features SET status=0 WHERE app_code='platform' AND code='org'",
    );
    await pool.query(
      "UPDATE public.menus SET status=0 WHERE app_code='platform' AND key='grant'",
    );
    await pool.query(
      "UPDATE public.menus SET parent_key='org' WHERE app_code='platform' AND key='subscription'",
    );
    try {
      expect((await apps()).some(({ code }) => code === "system")).toBe(false);
      expect(await menus("system")).toEqual([]);
      expect((await menus("platform")).map(({ key }) => key)).toEqual([
        "onboarding",
      ]);
    } finally {
      await syncCatalog(pool);
    }
  });
  it("已缓存身份的角色变更后，下一次请求不再返回旧应用与菜单", async () => {
    expect((await apps()).length).toBe(4);
    await pool.query("DELETE FROM public.identity_roles WHERE identity_id=$1", [
      companyIdentity,
    ]);
    try {
      expect(await apps()).toEqual([]);
      expect(await menus("platform")).toEqual([]);
    } finally {
      await pool.query(
        "INSERT INTO public.identity_roles (identity_id,role_id) SELECT $1,id FROM public.roles WHERE code='company-developer'",
        [companyIdentity],
      );
    }
  });
});

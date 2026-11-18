import { POSTGRES_IMAGE } from "../helpers/postgres-image.js";
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
  availableModulesSchema,
  currentMenusSchema,
  moduleMenusSchema,
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
  ModuleNavigationService,
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
  postgres = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
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
      ModuleNavigationService,
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

describe("新版模块导航", () => {
  it("院系专业与班级管理分别按自己的查看权限及功能状态显示", async () => {
    const readSchoolMenus = async () => {
      const response = await request("menus/current?module=base");
      expect(response.status).toBe(200);
      return (
        successResponseSchema(moduleMenusSchema)
          .parse(await response.json())
          .data.find((group) => group.key === "school")?.children ?? []
      );
    };
    try {
      const initial = await readSchoolMenus();
      const colleges = initial.findIndex((menu) => menu.key === "colleges");
      const classes = initial.findIndex((menu) => menu.key === "classes");
      expect(colleges).toBeGreaterThanOrEqual(0);
      expect(colleges).toBeLessThan(classes);
      expect(initial[colleges]).toMatchObject({
        name: "院系专业",
        path: "/colleges",
      });
      await pool.query(
        "UPDATE public.features SET status=0 WHERE app_code='school' AND code IN ('class','teaching-class')",
      );
      const withoutClasses = await readSchoolMenus();
      expect(withoutClasses.some((menu) => menu.key === "classes")).toBe(false);
      expect(withoutClasses.some((menu) => menu.key === "colleges")).toBe(true);
      await syncCatalog(pool);
      await pool.query(
        "UPDATE public.features SET status=0 WHERE app_code='school' AND code='college'",
      );
      const withoutColleges = await readSchoolMenus();
      expect(withoutColleges.some((menu) => menu.key === "colleges")).toBe(
        false,
      );
      expect(withoutColleges.some((menu) => menu.key === "classes")).toBe(true);
      const teacherResponse = await request(
        "menus/current?module=base",
        teacherToken,
      );
      const teacherMenus = successResponseSchema(moduleMenusSchema)
        .parse(await teacherResponse.json())
        .data.flatMap((group) => group.children);
      expect(teacherMenus.some((menu) => menu.key === "colleges")).toBe(false);
    } finally {
      await syncCatalog(pool);
    }
  });

  it("模块菜单应用覆盖与启停后重新计算可见性", async () => {
    await pool.query(
      "INSERT INTO public.menu_overrides (app_code,menu_key,display_name,sort) VALUES ('school','student','本校学生',0)",
    );
    await pool.query(
      "UPDATE public.features SET status=0 WHERE app_code='school' AND code='class'",
    );
    try {
      const response = await request("menus/current?module=base", teacherToken);
      const groups = successResponseSchema(moduleMenusSchema).parse(
        await response.json(),
      ).data;
      const items = groups.flatMap(({ children }) => children);
      expect(items[0]).toMatchObject({
        key: "students",
        name: "本校学生",
        sort: 0,
      });
      expect(items.some(({ key }) => key === "classes")).toBe(true);
      await pool.query(
        "UPDATE public.features SET status=0 WHERE app_code='school' AND code='teaching-class'",
      );
      const hidden = await request("menus/current?module=base", teacherToken);
      const remaining = successResponseSchema(moduleMenusSchema).parse(
        await hidden.json(),
      ).data;
      expect(
        remaining.flatMap(({ children }) => children).map(({ key }) => key),
      ).toEqual(["students"]);
    } finally {
      await pool.query("DELETE FROM public.menu_overrides");
      await syncCatalog(pool);
    }
  });

  it("研发获得两个模块及固定分组，不泄露无权限的组织菜单", async () => {
    const response = await request("modules/available");
    expect(response.status).toBe(200);
    const items = successResponseSchema(availableModulesSchema).parse(
      await response.json(),
    ).data;
    expect(items.map(({ code }) => code)).toEqual(["base", "platform-admin"]);
    const result = await request("menus/current?module=base");
    expect(result.status).toBe(200);
    const groups = successResponseSchema(moduleMenusSchema).parse(
      await result.json(),
    ).data;
    expect(groups.map(({ name }) => name)).toEqual([
      "学校数据",
      "学籍变动",
      "授权记录",
    ]);
    expect(
      groups.flatMap(({ children }) => children).map(({ name }) => name),
    ).toContain("学校管理");
    expect(
      groups
        .flatMap(({ children }) => children)
        .some(({ key }) => key === "members"),
    ).toBe(false);
  });
  it("教师仅见基础信息的班级与学生，无角色返回空列表", async () => {
    const response = await request("modules/available", teacherToken);
    const items = successResponseSchema(availableModulesSchema).parse(
      await response.json(),
    ).data;
    expect(items.map(({ code }) => code)).toEqual(["base"]);
    const result = await request("menus/current?module=base", teacherToken);
    const groups = successResponseSchema(moduleMenusSchema).parse(
      await result.json(),
    ).data;
    expect(
      groups.flatMap(({ children }) => children).map(({ name }) => name),
    ).toEqual(["班级管理", "学生管理"]);
    const denied = await request(
      "menus/current?module=platform-admin",
      teacherToken,
    );
    expect(denied.status).toBe(200);
    expect(
      successResponseSchema(moduleMenusSchema).parse(await denied.json()).data,
    ).toEqual([]);
    const empty = await request("modules/available", emptyToken);
    expect(empty.status).toBe(200);
    expect(
      successResponseSchema(availableModulesSchema).parse(await empty.json())
        .data,
    ).toEqual([]);
  });
  it("模块导航要求身份令牌并拒绝未知、混合参数", async () => {
    for (const token of [accountToken, ""]) {
      expect((await request("modules/available", token)).status).toBe(401);
      expect((await request("menus/current?module=base", token)).status).toBe(
        401,
      );
    }
    for (const query of ["module=unknown", "module=base&app=school"]) {
      expect((await request(`menus/current?${query}`)).status).toBe(400);
    }
  });
});

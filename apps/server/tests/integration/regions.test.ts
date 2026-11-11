import "reflect-metadata";
import { generateKeyPairSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { ServerConfig } from "@smart-sport/config/env";
import {
  apiResponseSchema,
  regionListSchema,
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
  RegionsController,
  RegionsRepository,
  RegionsService,
} from "../../src/modules/platform/regions/index.js";
import { importRegions } from "../../src/modules/platform/regions/region-importer.js";
import { requestContextMiddleware } from "../../src/request-context.js";
import { SERVER_CONFIG } from "../../src/server-config.js";

let container: StartedPostgreSqlContainer | undefined;
let pool: pg.Pool;
let app: INestApplication;
let base: string;
let accessToken: string;
const seedFile = fileURLToPath(
  new URL("../../../../deploy/seed/regions.csv", import.meta.url),
);
const pair = generateKeyPairSync("ed25519");
const config = {
  NODE_ENV: "test",
  JWT_PRIVATE_KEY: pair.privateKey
    .export({ format: "der", type: "pkcs8" })
    .toString("base64"),
  JWT_KEY_ID: "regions-test",
} as ServerConfig;

beforeAll(async () => {
  container = await new PostgreSqlContainer(
    "postgres:17.11-alpine3.23",
  ).start();
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await migratePublic(pool);
  await pool.query(
    "INSERT INTO public.regions (code,name,level,path,status) VALUES ('990000','旧区划',1,'990000',1)",
  );
  expect(await importRegions(pool, seedFile)).toBe(3223);
  expect(await importRegions(pool, seedFile)).toBe(3223);

  const module = await Test.createTestingModule({
    imports: [ClsModule.forRoot({ global: true })],
    controllers: [RegionsController],
    providers: [
      RegionsRepository,
      RegionsService,
      AuthenticatedGuard,
      AccessTokenSigner,
      { provide: ACCESS_TOKEN_VERIFIER, useExisting: AccessTokenSigner },
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
  accessToken = await app.get(AccessTokenSigner).signAccount({
    userId: v7(),
    sessionId: v7(),
    tokenVersion: 0,
  });
}, 120000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await container?.stop();
}, 30000);

function list(parent?: string, token = accessToken) {
  const query = parent ? `?parent=${parent}` : "";
  return fetch(`${base}/api/v1/regions${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("全国三级行政区划导入与查询", () => {
  it("完整导入、重复执行无重复，并停用种子中不存在的旧区划", async () => {
    const result = await pool.query(
      "SELECT count(*)::int AS total, count(*) FILTER (WHERE status=1)::int AS enabled FROM public.regions",
    );
    expect(result.rows[0]).toEqual({ total: 3224, enabled: 3223 });
    const retired = await pool.query(
      "SELECT status FROM public.regions WHERE code='990000'",
    );
    expect(retired.rows[0]?.status).toBe(0);
  });

  it("按省、市、区县逐级加载，并返回稳定的代码顺序", async () => {
    const provinces = successResponseSchema(regionListSchema).parse(
      await (await list()).json(),
    );
    expect(provinces.data).toHaveLength(34);
    expect(provinces.data[0]).toMatchObject({
      code: "110000",
      name: "北京市",
      level: 1,
      parentCode: null,
      path: "110000",
    });

    const cities = successResponseSchema(regionListSchema).parse(
      await (await list("110000")).json(),
    );
    expect(cities.data).toEqual([
      {
        code: "110100",
        name: "市辖区",
        level: 2,
        parentCode: "110000",
        path: "110000.110100",
      },
    ]);

    const counties = successResponseSchema(regionListSchema).parse(
      await (await list("110100")).json(),
    );
    expect(counties.data).toHaveLength(16);
    expect(counties.data[0]).toMatchObject({
      code: "110101",
      name: "东城区",
      level: 3,
    });
  });

  it("未登录返回 401，非法父级格式返回字段错误", async () => {
    expect((await list(undefined, "")).status).toBe(401);
    const invalid = await list("11");
    expect(invalid.status).toBe(400);
    const body = apiResponseSchema.parse(await invalid.json());
    expect(body.code).toBe(90001);
    expect(body.data).toEqual({ fields: { parent: ["格式或取值不符合要求"] } });
  });
});

import "reflect-metadata";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { ServerConfig } from "@smart-sport/config/env";
import {
  type RoleDetail,
  roleDetailSchema,
  roleListSchema,
  type SaveRoleGrants,
  successResponseSchema,
} from "@smart-sport/contracts";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { ClsModule, ClsService } from "nestjs-cls";
import pg from "pg";
import { v7 } from "uuid";
import { expect } from "vitest";
import {
  ApiExceptionFilter,
  ApiResponseInterceptor,
} from "../../src/api-response.js";
import { migratePublic } from "../../src/database/migrate.js";
import { DRIZZLE } from "../../src/database/registry.js";
import { IdempotencyInterceptor } from "../../src/idempotency.js";
import { AccessTokenSigner } from "../../src/infra/auth/access-token-signer.js";
import { MemberCredentials } from "../../src/infra/crypto/member-credentials.js";
import { PasswordHasher } from "../../src/infra/crypto/password-hasher.js";
import { AuthController } from "../../src/modules/platform/auth/auth.controller.js";
import { AuthRepository } from "../../src/modules/platform/auth/auth.repository.js";
import { AuthService } from "../../src/modules/platform/auth/index.js";
import { syncCatalog } from "../../src/modules/platform/catalog/catalog-sync.js";
import {
  DepartmentOrganizationGuard,
  DepartmentPresetsService,
  DepartmentStatisticsRepository,
  DepartmentsController,
  DepartmentsRepository,
  DepartmentsService,
} from "../../src/modules/platform/departments/index.js";
import {
  IdentitiesController,
  IdentitiesRepository,
  IdentitiesService,
} from "../../src/modules/platform/identities/index.js";
import {
  MemberAccountService,
  MemberListRepository,
  MemberOptionsService,
  MemberOrganizationGuard,
  MemberPolicy,
  MemberReader,
  MembersController,
  MembersRepository,
  MembersService,
} from "../../src/modules/platform/members/index.js";
import {
  CompanyOrganizationGuard,
  OrganizationsController,
  OrganizationsRepository,
  OrganizationsService,
} from "../../src/modules/platform/organizations/index.js";
import {
  PresetRolesController,
  PresetRolesRepository,
  PresetRolesService,
  TemplateReader,
} from "../../src/modules/platform/preset-roles/index.js";
import {
  RoleManagementController,
  RoleManagementRepository,
  RoleManagementService,
  RoleReader,
} from "../../src/modules/platform/role-management/index.js";
import { requestContextMiddleware } from "../../src/request-context.js";
import { SERVER_CONFIG } from "../../src/server-config.js";
import { authentication } from "./authentication.js";

export async function roleManagementFixture(withAuth = false) {
  const postgres = await new PostgreSqlContainer(
    "postgres:17.11-alpine3.23",
  ).start();
  const pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await migratePublic(pool);
  await syncCatalog(pool);
  await pool.query(
    "INSERT INTO public.regions(code,name,level,path) VALUES('990000','测试省',1,'990000')",
  );
  const pair = generateKeyPairSync("ed25519");
  const config = {
    NODE_ENV: "test",
    FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    STUDENT_HMAC_KEY: randomBytes(32).toString("base64"),
    JWT_PRIVATE_KEY: pair.privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64"),
    JWT_KEY_ID: "role-management-test",
  } as ServerConfig;
  const security = await authentication(config);
  const module = await Test.createTestingModule({
    imports: [ClsModule.forRoot({ global: true })],
    controllers: [
      ...(withAuth ? [AuthController, IdentitiesController] : []),
      MembersController,
      RoleManagementController,
      PresetRolesController,
      OrganizationsController,
      DepartmentsController,
    ],
    providers: [
      ...security.providers,
      ...(withAuth
        ? [AuthRepository, AuthService, IdentitiesRepository, IdentitiesService]
        : []),
      MembersRepository,
      MembersService,
      MemberOrganizationGuard,
      MemberOptionsService,
      MemberPolicy,
      MemberReader,
      MemberListRepository,
      MemberAccountService,
      MemberCredentials,
      PasswordHasher,
      RoleManagementRepository,
      RoleManagementService,
      RoleReader,
      DepartmentsRepository,
      DepartmentsService,
      DepartmentOrganizationGuard,
      DepartmentPresetsService,
      DepartmentStatisticsRepository,
      PresetRolesRepository,
      PresetRolesService,
      TemplateReader,
      CompanyOrganizationGuard,
      OrganizationsRepository,
      OrganizationsService,
      AccessTokenSigner,
      { provide: DRIZZLE, useValue: drizzle(pool) },
      { provide: SERVER_CONFIG, useValue: security.config },
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
      { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
      { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    ],
  }).compile();
  const app = module.createNestApplication();
  app.use(requestContextMiddleware(app.get(ClsService)));
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const seed = async (
    type: "company" | "school" | "bureau" | "agent",
    roleCode: string | null,
    organizationId?: string,
  ) => {
    const userId = v7(),
      orgId = organizationId ?? v7(),
      identityId = v7(),
      sessionId = v7();
    if (!organizationId)
      await pool.query(
        "INSERT INTO public.orgs(id,type,name,code,region_code) VALUES($1,$2,'角色测试组织',$3,$4)",
        [
          orgId,
          type,
          orgId,
          type === "school" || type === "bureau" ? "990000" : null,
        ],
      );
    await pool.query(
      "INSERT INTO public.users(id,username,real_name,password_hash,must_change_password) VALUES($1,$2,'角色测试','test',false)",
      [userId, userId],
    );
    await pool.query(
      "INSERT INTO public.identities(id,user_id,org_id,type) VALUES($1,$2,$3,$4)",
      [identityId, userId, orgId, type],
    );
    if (roleCode)
      await pool.query(
        "INSERT INTO public.identity_roles(identity_id,role_id) SELECT $1,id FROM public.roles WHERE code=$2",
        [identityId, roleCode],
      );
    await pool.query(
      "INSERT INTO public.user_sessions(id,user_id,identity_id,refresh_token_hash,client,expires_at) VALUES($1,$2,$3,$4,'admin',now()+interval '1 day')",
      [sessionId, userId, identityId, sessionId.replaceAll("-", "").repeat(2)],
    );
    const signer = app.get(AccessTokenSigner);
    return {
      orgId,
      identityId,
      token: await signer.signIdentity({
        userId,
        sessionId,
        identityId,
        tokenVersion: 0,
      }),
      account: await signer.signAccount({ userId, sessionId, tokenVersion: 0 }),
    };
  };
  const admin = await seed("company", "company-super-admin");
  const request = (
    path = "",
    method = "GET",
    body?: unknown,
    token = admin.token,
    key = v7(),
  ) =>
    fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const detail = async (id: string, token = admin.token) => {
    const r = await request(`/roles/${id}`, "GET", undefined, token);
    expect(r.status).toBe(200);
    return successResponseSchema(roleDetailSchema).parse(await r.json()).data;
  };
  const list = async (token = admin.token, query = "") => {
    const r = await request(`/roles${query}`, "GET", undefined, token);
    expect(r.status).toBe(200);
    return successResponseSchema(roleListSchema).parse(await r.json()).data;
  };
  const create = async (code = "生产", token = admin.token) => {
    const baseRole = (await list(token)).find(
      (r) => r.kind === "preset" && r.name === code,
    );
    if (!baseRole) throw new Error("缺少基础角色");
    const r = await request(
      "/roles",
      "POST",
      {
        name: `自定义${code}`,
        baseRoleId: baseRole.id,
        dataScope: baseRole.dataScope,
      },
      token,
    );
    expect(r.status).toBe(201);
    return successResponseSchema(roleDetailSchema).parse(await r.json()).data;
  };
  return {
    pool,
    base,
    config: security.config,
    app,
    admin,
    seed,
    request,
    detail,
    list,
    create,
    stop: async () => {
      await app.close();
      await security.stop();
      await pool.end();
      await postgres.stop();
    },
  };
}
export function roleInput(row: RoleDetail): SaveRoleGrants {
  return {
    version: row.version,
    dataScope: row.dataScope,
    grants: row.grants.map(({ app, feature, grant }) => ({
      app,
      feature,
      grant,
    })),
  };
}

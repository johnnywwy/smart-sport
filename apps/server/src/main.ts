import "reflect-metadata";
import { Module } from "@nestjs/common";
import {
  APP_FILTER,
  APP_GUARD,
  APP_INTERCEPTOR,
  NestFactory,
} from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { loadConfig, loadDatabaseConfig } from "@smart-sport/config/env";
import { createLoggerOptions } from "@smart-sport/config/logger";
import { ClsModule, ClsService } from "nestjs-cls";
import { Logger, LoggerModule } from "nestjs-pino";
import { ApiExceptionFilter, ApiResponseInterceptor } from "./api-response.js";
import {
  ACCESS_TOKEN_VERIFIER,
  AUTH_CONTEXT_LOADER,
  AuthenticatedGuard,
} from "./core/authenticated.guard.js";
import { PermissionGuard } from "./core/permission.guard.js";
import { DataSourceRegistry, DRIZZLE } from "./database/registry.js";
import { HealthController } from "./health.js";
import { IdempotencyInterceptor } from "./idempotency.js";
import { AccessTokenSigner } from "./infra/auth/access-token-signer.js";
import { MemberCredentials } from "./infra/crypto/member-credentials.js";
import { PasswordHasher } from "./infra/crypto/password-hasher.js";
import { ObjectStorage } from "./infra/storage/object-storage.js";
import { TenantRepository, TenantService } from "./infra/tenant/index.js";
import {
  FileAccessService,
  FileBoundaryGuard,
  FilesController,
  FilesRepository,
  FilesService,
  SchoolFilesController,
} from "./modules/foundation/files/index.js";
import {
  NumberRulesController,
  NumberRulesService,
  NumbersRepository,
  NumbersService,
} from "./modules/foundation/numbers/index.js";
import {
  TaskExecutionService,
  TasksController,
  TasksRepository,
  TasksService,
} from "./modules/foundation/tasks/index.js";
import {
  AcademicController,
  AcademicRepository,
  AcademicService,
} from "./modules/platform/academic/index.js";
import {
  AuditPartitionsRepository,
  AuditPartitionsService,
  AuditQueryController,
  AuditQueryRepository,
  AuditQueryService,
} from "./modules/platform/audit/index.js";
import { AuthController } from "./modules/platform/auth/auth.controller.js";
import { AuthRepository } from "./modules/platform/auth/auth.repository.js";
import { AuthService } from "./modules/platform/auth/auth.service.js";
import {
  DepartmentOrganizationGuard,
  DepartmentPresetsService,
  DepartmentScopesController,
  DepartmentScopesRepository,
  DepartmentScopesService,
  DepartmentStatisticsRepository,
  DepartmentsController,
  DepartmentsRepository,
  DepartmentsService,
  ScopeOptionsController,
} from "./modules/platform/departments/index.js";
import {
  DictsController,
  DictsRepository,
  DictsService,
} from "./modules/platform/dicts/index.js";
import {
  IdentitiesController,
  IdentitiesRepository,
  IdentitiesService,
} from "./modules/platform/identities/index.js";
import {
  AuthContextService,
  ContextRepository,
  IdentityContextService,
} from "./modules/platform/identity-context/index.js";
import {
  IdentityScopesController,
  IdentityScopesRepository,
  IdentityScopesService,
  MemberAccountService,
  MemberListRepository,
  MemberOptionsService,
  MemberOrganizationGuard,
  MemberPolicy,
  MemberReader,
  MembersController,
  MembersRepository,
  MembersService,
} from "./modules/platform/members/index.js";
import {
  MenuManagementController,
  MenuManagementRepository,
  MenuManagementService,
  ModuleNavigationService,
  NavigationController,
  NavigationRepository,
  NavigationService,
} from "./modules/platform/navigation/index.js";
import {
  CompanyOrganizationGuard,
  OrganizationsController,
  OrganizationsRepository,
  OrganizationsService,
} from "./modules/platform/organizations/index.js";
import {
  ParamManagementService,
  ParamsController,
  ParamsRepository,
  ParamsService,
} from "./modules/platform/params/index.js";
import {
  PresetRolesController,
  PresetRolesRepository,
  PresetRolesService,
  TemplateReader,
} from "./modules/platform/preset-roles/index.js";
import {
  RegionManagementController,
  RegionManagementRepository,
  RegionManagementService,
  RegionsController,
  RegionsRepository,
  RegionsService,
} from "./modules/platform/regions/index.js";
import {
  RoleManagementController,
  RoleManagementRepository,
  RoleManagementService,
  RoleReader,
} from "./modules/platform/role-management/index.js";
import {
  AdministratorRepository,
  AdministratorService,
  RolesRepository,
  RolesService,
} from "./modules/platform/roles/index.js";
import {
  SchoolProfileGuard,
  SchoolProfilePolicy,
  SchoolProfilesController,
  SchoolProfilesRepository,
  SchoolProfilesService,
} from "./modules/platform/school-profiles/index.js";
import {
  ScopeQueryController,
  ScopeQueryRepository,
  ScopeQueryService,
  ScopeRepository,
  ScopeService,
} from "./modules/platform/scope/index.js";
import {
  ScopeCandidatesService,
  ScopeOptionsRepository,
} from "./modules/platform/scope-candidates/index.js";
import { RateLimitGuard } from "./rate-limit.js";
import { requestContextMiddleware } from "./request-context.js";
import { SERVER_CONFIG } from "./server-config.js";
import { withZodSchemas } from "./zod-route.js";

const config = loadConfig("server");
const databaseConfig = loadDatabaseConfig();

@Module({
  imports: [
    ClsModule.forRoot({ global: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        customProps: (request) => ({ traceId: request.id }),
        ...createLoggerOptions(
          config.NODE_ENV,
          "smart-sport-server",
          Boolean(process.stdout.isTTY),
        ),
        ...(config.NODE_ENV === "development"
          ? {
              customLogLevel: (_request, response, error) =>
                error || response.statusCode >= 500
                  ? "error"
                  : response.statusCode >= 400
                    ? "warn"
                    : "info",
              customSuccessMessage: (request, response, duration) =>
                `${request.method} ${request.url?.split("?")[0]} → ${response.statusCode} (${duration} ms)`,
              customErrorMessage: (request, response) =>
                `${request.method} ${request.url?.split("?")[0]} → ${response.statusCode} 请求失败`,
            }
          : {}),
      },
    }),
  ],
  controllers: [
    TasksController,
    FilesController,
    SchoolFilesController,
    AuditQueryController,
    MenuManagementController,
    ParamsController,
    DictsController,
    NumberRulesController,
    AcademicController,
    SchoolProfilesController,
    IdentityScopesController,
    MembersController,
    HealthController,
    AuthController,
    RegionManagementController,
    RegionsController,
    OrganizationsController,
    IdentitiesController,
    NavigationController,
    PresetRolesController,
    RoleManagementController,
    DepartmentsController,
    DepartmentScopesController,
    ScopeOptionsController,
    ScopeQueryController,
  ],
  providers: [
    TenantRepository,
    TenantService,
    TasksRepository,
    TasksService,
    TaskExecutionService,
    ObjectStorage,
    FileAccessService,
    FileBoundaryGuard,
    FilesRepository,
    FilesService,
    AuditQueryRepository,
    AuditQueryService,
    AuditPartitionsRepository,
    AuditPartitionsService,
    MenuManagementRepository,
    MenuManagementService,
    ParamsRepository,
    ParamsService,
    RegionManagementService,
    RegionManagementRepository,
    ParamManagementService,
    DictsRepository,
    DictsService,
    NumberRulesService,
    NumbersRepository,
    NumbersService,
    AcademicRepository,
    AcademicService,
    SchoolProfileGuard,
    SchoolProfilePolicy,
    SchoolProfilesRepository,
    SchoolProfilesService,
    ScopeQueryRepository,
    ScopeQueryService,
    ScopeRepository,
    ScopeService,
    IdentityScopesRepository,
    IdentityScopesService,
    MembersRepository,
    MembersService,
    MemberOrganizationGuard,
    MemberOptionsService,
    MemberPolicy,
    MemberReader,
    MemberListRepository,
    MemberAccountService,
    MemberCredentials,
    AuthRepository,
    AuthService,
    IdentitiesRepository,
    NavigationRepository,
    NavigationService,
    ModuleNavigationService,
    IdentitiesService,
    AccessTokenSigner,
    PasswordHasher,
    { provide: APP_GUARD, useClass: AuthenticatedGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    AuthContextService,
    { provide: AUTH_CONTEXT_LOADER, useExisting: AuthContextService },
    { provide: ACCESS_TOKEN_VERIFIER, useExisting: AccessTokenSigner },
    RegionsRepository,
    RegionsService,
    OrganizationsRepository,
    OrganizationsService,
    CompanyOrganizationGuard,
    PresetRolesRepository,
    PresetRolesService,
    TemplateReader,
    AdministratorRepository,
    AdministratorService,
    RolesRepository,
    RolesService,
    RoleManagementRepository,
    RoleManagementService,
    RoleReader,
    DepartmentsRepository,
    DepartmentScopesRepository,
    DepartmentScopesService,
    ScopeOptionsRepository,
    ScopeCandidatesService,
    DepartmentsService,
    DepartmentStatisticsRepository,
    DepartmentPresetsService,
    DepartmentOrganizationGuard,
    ContextRepository,
    IdentityContextService,
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: SERVER_CONFIG, useValue: config },
    {
      provide: DataSourceRegistry,
      useFactory: () => new DataSourceRegistry(databaseConfig),
    },
    {
      provide: DRIZZLE,
      inject: [DataSourceRegistry],
      useFactory: (registry: DataSourceRegistry) => registry.get().db,
    },
  ],
})
class ServerModule {}

const app = await NestFactory.create<NestExpressApplication>(ServerModule, {
  bufferLogs: true,
});
app.useLogger(app.get(Logger));
app.use(requestContextMiddleware(app.get(ClsService)));
app.useBodyParser("json", { limit: "1mb" });
app.useBodyParser("urlencoded", { limit: "1mb", extended: true });
app.enableShutdownHooks();
if (config.apiDocsEnabled && config.NODE_ENV === "development") {
  const options = new DocumentBuilder()
    .setTitle("智慧体育云平台 API")
    .setVersion("1.0")
    .build();
  SwaggerModule.setup(
    "api/docs",
    app,
    () => withZodSchemas(SwaggerModule.createDocument(app, options)),
    {
      jsonDocumentUrl: "api/docs/openapi.json",
      raw: ["json"],
    },
  );
}
await app.listen(config.PORT, config.HOST);

app.get(Logger).log(`后端服务已启动：http://${config.HOST}:${config.PORT}`);

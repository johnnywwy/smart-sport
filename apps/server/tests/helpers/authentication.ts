import { APP_GUARD } from "@nestjs/core";
import type { ServerConfig } from "@smart-sport/config/env";
import { GenericContainer } from "testcontainers";
import {
  ACCESS_TOKEN_VERIFIER,
  AUTH_CONTEXT_LOADER,
  AuthenticatedGuard,
} from "../../src/core/authenticated.guard.js";
import { PermissionGuard } from "../../src/core/permission.guard.js";
import { AccessTokenSigner } from "../../src/infra/auth/access-token-signer.js";
import {
  AuthContextService,
  ContextRepository,
  IdentityContextService,
} from "../../src/modules/platform/identity-context/index.js";
import {
  AdministratorRepository,
  AdministratorService,
  RolesRepository,
  RolesService,
} from "../../src/modules/platform/roles/index.js";

/** 集成测试沿用生产鉴权装配，不跳过会话和权限上下文校验。 */
export async function authentication(config: ServerConfig) {
  const redis = await new GenericContainer("redis:8.10.3-alpine3.23")
    .withExposedPorts(6379)
    .start();
  const configured = {
    ...config,
    REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
  };
  return {
    config: configured,
    stop: () => redis.stop(),
    providers: [
      { provide: APP_GUARD, useClass: AuthenticatedGuard },
      { provide: APP_GUARD, useClass: PermissionGuard },
      { provide: ACCESS_TOKEN_VERIFIER, useExisting: AccessTokenSigner },
      { provide: AUTH_CONTEXT_LOADER, useExisting: AuthContextService },
      AuthContextService,
      ContextRepository,
      IdentityContextService,
      AdministratorRepository,
      AdministratorService,
      RolesRepository,
      RolesService,
    ],
  };
}

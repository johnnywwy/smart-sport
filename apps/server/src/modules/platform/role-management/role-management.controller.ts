import type { IncomingMessage } from "node:http";
import { Controller, Get, Inject, Post, Put, Req } from "@nestjs/common";
import {
  type CreateRole,
  createRoleSchema,
  type ResetRole,
  resetRoleSchema,
  roleDetailSchema,
  roleListQuerySchema,
  roleListSchema,
  roleParamsSchema,
  type SaveRoleGrants,
  saveRoleGrantsSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { ApiException } from "../../../api-response.js";
import type { AuthenticatedRequest } from "../../../core/authenticated.guard.js";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { Idempotent } from "../../../idempotency.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../identity-context/index.js";
import { RoleManagementService } from "./role-management.service.js";

const identityScope = (ctx: import("@nestjs/common").ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.identityId;

@Controller("api/v1/roles")
export class RoleManagementController {
  constructor(
    @Inject(RoleManagementService)
    private readonly service: RoleManagementService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Get()
  @RequirePermissions("org:role:view")
  @ApiZodResponse(200, successResponseSchema(roleListSchema), "本组织角色列表")
  list(
    @ZodRequest("query", roleListQuerySchema) query: { identityType?: string },
  ) {
    return this.service.list(this.actor(), query.identityType);
  }
  @Get(":id")
  @RequirePermissions("org:role:view")
  @ApiZodResponse(
    200,
    successResponseSchema(roleDetailSchema),
    "角色最终档位与差异",
  )
  detail(@ZodRequest("params", roleParamsSchema) params: { id: string }) {
    return this.service.detail(params.id, this.actor());
  }
  @Post()
  @RequirePermissions("org:role:create")
  @Idempotent("role.create", identityScope)
  @ApiZodResponse(
    201,
    successResponseSchema(roleDetailSchema),
    "基于内置角色新建自定义角色",
  )
  create(
    @ZodRequest("body", createRoleSchema) input: CreateRole,
    @Req() request: IncomingMessage,
  ) {
    return this.service.create(input, this.actor(), this.metadata(request));
  }
  @Put(":id/grants")
  @RequirePermissions("org:role:update")
  @ApiZodResponse(
    200,
    successResponseSchema(roleDetailSchema),
    "整体提交角色档位",
  )
  save(
    @ZodRequest("params", roleParamsSchema) params: { id: string },
    @ZodRequest("body", saveRoleGrantsSchema) input: SaveRoleGrants,
    @Req() request: IncomingMessage,
  ) {
    return this.service.save(
      params.id,
      input,
      this.actor(),
      this.metadata(request),
    );
  }
  @Post(":id/reset")
  @RequirePermissions("org:role:update")
  @Idempotent("role.reset", identityScope)
  @ApiZodResponse(
    201,
    successResponseSchema(roleDetailSchema),
    "恢复基础角色设置",
  )
  reset(
    @ZodRequest("params", roleParamsSchema) params: { id: string },
    @ZodRequest("body", resetRoleSchema) input: ResetRole,
    @Req() request: IncomingMessage,
  ) {
    return this.service.reset(
      params.id,
      input,
      this.actor(),
      this.metadata(request),
    );
  }
  private actor() {
    const actor = this.cls.get<IdentityContext | undefined>("identityContext");
    if (!actor) throw new ApiException(11101);
    return actor;
  }
  private metadata(request: IncomingMessage) {
    return {
      traceId: this.cls.getId(),
      ip: request.socket.remoteAddress ?? "unknown",
      userAgent: request.headers["user-agent"] ?? "",
    };
  }
}

import type { IncomingMessage } from "node:http";
import { Controller, Get, Inject, Post, Put, Req } from "@nestjs/common";
import {
  presetRoleImpactSchema,
  presetRoleListSchema,
  presetRoleParamsSchema,
  presetRoleQuerySchema,
  presetRoleSchema,
  type ResetPresetRole,
  resetPresetRoleSchema,
  type SavePresetRole,
  savePresetRoleSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { ApiException } from "../../../api-response.js";
import type { AuthenticatedRequest } from "../../../core/authenticated.guard.js";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { Idempotent } from "../../../idempotency.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../identity-context/index.js";
import { PresetRolesService } from "./preset-roles.service.js";

@Controller("api/v1/preset-roles")
export class PresetRolesController {
  constructor(
    @Inject(PresetRolesService) private readonly service: PresetRolesService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Get()
  @RequirePermissions("system:preset-role:view")
  @ApiZodResponse(
    200,
    successResponseSchema(presetRoleListSchema),
    "角色模板列表",
  )
  list(
    @ZodRequest("query", presetRoleQuerySchema) query: {
      identityType?: string;
    },
  ) {
    return this.service.list(query.identityType, this.actor().canUpdate);
  }
  @Put(":id")
  @RequirePermissions("system:preset-role:update")
  @ApiZodResponse(200, successResponseSchema(presetRoleSchema), "保存角色模板")
  save(
    @ZodRequest("params", presetRoleParamsSchema) params: { id: string },
    @ZodRequest("body", savePresetRoleSchema) input: SavePresetRole,
    @Req() request: IncomingMessage,
  ) {
    return this.service.save(
      params.id,
      input,
      this.actor(),
      this.metadata(request),
    );
  }
  @Post(":id/impact")
  @RequirePermissions("system:preset-role:view")
  @ApiZodResponse(
    201,
    successResponseSchema(presetRoleImpactSchema),
    "预览模板影响",
  )
  impact(
    @ZodRequest("params", presetRoleParamsSchema) params: { id: string },
    @ZodRequest("body", savePresetRoleSchema) input: SavePresetRole,
  ) {
    this.actor();
    return this.service.impact(params.id, input);
  }
  @Post(":id/reset")
  @RequirePermissions("system:preset-role:update")
  @Idempotent(
    "preset-role.reset",
    (ctx) =>
      ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.identityId,
  )
  @ApiZodResponse(
    201,
    successResponseSchema(presetRoleSchema),
    "恢复模板默认值",
  )
  reset(
    @ZodRequest("params", presetRoleParamsSchema) params: { id: string },
    @ZodRequest("body", resetPresetRoleSchema) input: ResetPresetRole,
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
    const context = this.cls.get<IdentityContext | undefined>(
      "identityContext",
    );
    if (context?.identityType !== "company") throw new ApiException(11101);
    return {
      userId: context.userId,
      identityId: context.identityId,
      orgId: context.orgId,
      canUpdate: context.permissions.has("system:preset-role:update"),
    };
  }
  private metadata(request: IncomingMessage) {
    return {
      traceId: this.cls.getId(),
      ip: request.socket.remoteAddress ?? "unknown",
      userAgent: request.headers["user-agent"] ?? "",
    };
  }
}

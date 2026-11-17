import type { IncomingMessage } from "node:http";
import { Controller, Get, Inject, Patch, Req } from "@nestjs/common";
import {
  type SystemParamQuery,
  successResponseSchema,
  systemParamEmptyQuerySchema,
  systemParamListSchema,
  systemParamParamsSchema,
  systemParamQuerySchema,
  systemParamSchema,
  type UpdateSystemParam,
  updateSystemParamSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../identity-context/index.js";
import { ParamManagementService } from "./param-management.service.js";
@Controller("api/v1/system-params")
export class ParamsController {
  constructor(
    @Inject(ParamManagementService)
    private readonly service: ParamManagementService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Get()
  @RequirePermissions("system:param:view")
  @ApiZodResponse(
    200,
    successResponseSchema(systemParamListSchema),
    "系统参数列表",
  )
  list(@ZodRequest("query", systemParamQuerySchema) input: SystemParamQuery) {
    return this.service.list(input, this.actor());
  }
  @Get(":id")
  @RequirePermissions("system:param:view")
  @ApiZodResponse(200, successResponseSchema(systemParamSchema), "系统参数详情")
  detail(
    @ZodRequest("params", systemParamParamsSchema) params: { id: string },
    @ZodRequest("query", systemParamEmptyQuerySchema) _query: unknown,
  ) {
    return this.service.detail(params.id, this.actor());
  }
  @Patch(":id")
  @RequirePermissions("system:param:update")
  @ApiZodResponse(
    200,
    successResponseSchema(systemParamSchema),
    "修改参数并记录原因",
  )
  update(
    @ZodRequest("params", systemParamParamsSchema) params: { id: string },
    @ZodRequest("body", updateSystemParamSchema) input: UpdateSystemParam,
    @Req() request: IncomingMessage,
  ) {
    return this.service.update(params.id, input, this.actor(), {
      traceId: this.cls.getId(),
      ip: request.socket.remoteAddress ?? "unknown",
      userAgent: request.headers["user-agent"] ?? "",
    });
  }
  private actor() {
    return this.cls.get<IdentityContext>("identityContext");
  }
}

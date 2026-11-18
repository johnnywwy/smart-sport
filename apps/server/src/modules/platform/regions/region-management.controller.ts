import type { IncomingMessage } from "node:http";
import { Controller, Get, Inject, Post, Req } from "@nestjs/common";
import {
  confirmRegionSyncSchema,
  type RegionManagementQuery,
  regionManagementListSchema,
  regionManagementQuerySchema,
  regionSyncPreviewSchema,
  regionSyncResultSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { Idempotent } from "../../../idempotency.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../identity-context/index.js";
import { RegionManagementService } from "./region-management.service.js";
@Controller("api/v1/region-management")
export class RegionManagementController {
  constructor(
    @Inject(RegionManagementService)
    private readonly service: RegionManagementService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Get()
  @RequirePermissions("system:region:view")
  @ApiZodResponse(
    200,
    successResponseSchema(regionManagementListSchema),
    "区划管理及真实组织信息",
  )
  list(
    @ZodRequest("query", regionManagementQuerySchema)
    query: RegionManagementQuery,
  ) {
    return this.service.list(query, this.actor());
  }
  @Get("sync-preview")
  @RequirePermissions("system:region:import")
  @ApiZodResponse(
    200,
    successResponseSchema(regionSyncPreviewSchema),
    "审核区划变更及关联影响预览",
  )
  preview(
    @ZodRequest("query", regionManagementQuerySchema.pick({})) _query: unknown,
  ) {
    return this.service.preview(this.actor());
  }
  @Post("sync")
  @RequirePermissions("system:region:import")
  @Idempotent(
    "region.sync",
    (context) =>
      context.switchToHttp().getRequest<{ auth: { identityId: string } }>().auth
        .identityId,
  )
  @ApiZodResponse(
    201,
    successResponseSchema(regionSyncResultSchema),
    "确认已预览且没有关联影响的区划同步",
  )
  confirm(
    @ZodRequest("body", confirmRegionSyncSchema) input: { fingerprint: string },
    @Req() request: IncomingMessage,
  ) {
    return this.service.confirm(input.fingerprint, this.actor(), {
      traceId: this.cls.getId(),
      ip: request.socket.remoteAddress ?? "unknown",
      userAgent: request.headers["user-agent"] ?? "",
    });
  }
  private actor() {
    return this.cls.get<IdentityContext>("identityContext");
  }
}

import { Controller, Get, Inject } from "@nestjs/common";
import {
  type AuditLogQuery,
  auditLogListSchema,
  auditLogQuerySchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { RequireAnyPermissions } from "../../../core/permission.guard.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../identity-context/index.js";
import { AuditQueryService } from "./audit-query.service.js";

@Controller("api/v1/audit-logs")
export class AuditQueryController {
  constructor(
    @Inject(AuditQueryService) private readonly service: AuditQueryService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Get()
  @RequireAnyPermissions("system:audit:view", "org:audit:view")
  @ApiZodResponse(
    200,
    successResponseSchema(auditLogListSchema),
    "只读操作记录及对象变更历史",
  )
  list(@ZodRequest("query", auditLogQuerySchema) input: AuditLogQuery) {
    return this.service.list(
      input,
      this.cls.get<IdentityContext>("identityContext"),
    );
  }
}

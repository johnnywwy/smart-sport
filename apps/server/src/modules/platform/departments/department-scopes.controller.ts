import { Controller, Get, Inject, Put, Req, UseGuards } from "@nestjs/common";
import {
  departmentOrgQuerySchema,
  departmentParamsSchema,
  departmentScopesSchema,
  type SetDepartmentScopes,
  setDepartmentScopesSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { Idempotent } from "../../../idempotency.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../identity-context/index.js";
import {
  DepartmentOrganizationGuard,
  type DepartmentRequest,
} from "./department-organization.guard.js";
import { DepartmentScopesService } from "./department-scopes.service.js";

@Controller("api/v1/departments")
@UseGuards(DepartmentOrganizationGuard)
export class DepartmentScopesController {
  constructor(
    @Inject(DepartmentScopesService)
    private readonly service: DepartmentScopesService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Get(":id/scopes")
  @RequirePermissions("org:department:view")
  @ApiZodResponse(
    200,
    successResponseSchema(departmentScopesSchema),
    "部门负责范围与配置学校数",
  )
  get(
    @ZodRequest("query", departmentOrgQuerySchema) _query: unknown,
    @ZodRequest("params", departmentParamsSchema) params: { id: string },
    @Req() request: DepartmentRequest,
  ) {
    return this.service.get(this.orgId(request), params.id, this.actor());
  }
  @Put(":id/scopes")
  @RequirePermissions("org:department:update")
  @Idempotent("department.scopes.update", (context) => {
    const r = context
      .switchToHttp()
      .getRequest<DepartmentRequest & { params: { id: string } }>();
    return `${r.auth?.identityId}:${r.departmentOrgId?.toLowerCase()}:${r.params.id.toLowerCase()}`;
  })
  @ApiZodResponse(
    200,
    successResponseSchema(departmentScopesSchema),
    "整体替换部门负责范围",
  )
  set(
    @ZodRequest("query", departmentOrgQuerySchema) _query: unknown,
    @ZodRequest("params", departmentParamsSchema) params: { id: string },
    @ZodRequest("body", setDepartmentScopesSchema) input: SetDepartmentScopes,
    @Req() request: DepartmentRequest,
  ) {
    return this.service.set(
      this.orgId(request),
      params.id,
      input,
      this.actor(),
      {
        traceId: this.cls.getId(),
        ip: request.socket.remoteAddress ?? "unknown",
        userAgent: request.headers["user-agent"] ?? "",
      },
    );
  }
  private actor() {
    return this.cls.get<IdentityContext>("identityContext");
  }
  private orgId(request: DepartmentRequest) {
    if (!request.departmentOrgId) throw new Error("部门范围缺少已验证组织");
    return request.departmentOrgId;
  }
}

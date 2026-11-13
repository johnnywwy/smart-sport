import {
  Controller,
  Delete,
  Get,
  Inject,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  type CreateDepartment,
  createDepartmentSchema,
  type DeleteDepartment,
  deleteDepartmentSchema,
  departmentOrgQuerySchema,
  departmentParamsSchema,
  departmentSchema,
  departmentTreeSchema,
  successResponseSchema,
  type UpdateDepartment,
  updateDepartmentSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { z } from "zod";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { Idempotent } from "../../../idempotency.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../identity-context/index.js";
import {
  DepartmentOrganizationGuard,
  type DepartmentRequest,
} from "./department-organization.guard.js";
import { DepartmentsService } from "./departments.service.js";

@Controller("api/v1/departments")
@UseGuards(DepartmentOrganizationGuard)
export class DepartmentsController {
  constructor(
    @Inject(DepartmentsService) private readonly service: DepartmentsService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Get("tree")
  @RequirePermissions("org:department:view")
  @ApiZodResponse(
    200,
    successResponseSchema(departmentTreeSchema),
    "组织部门树与直属人数",
  )
  tree(
    @ZodRequest("query", departmentOrgQuerySchema) _query: unknown,
    @Req() request: DepartmentRequest,
  ) {
    return this.service.tree(this.orgId(request), this.actor());
  }
  @Post()
  @RequirePermissions("org:department:create")
  @Idempotent("department.create", (context) => {
    const r = context.switchToHttp().getRequest<DepartmentRequest>();
    return `${r.auth?.identityId}:${r.departmentOrgId}`;
  })
  @ApiZodResponse(201, successResponseSchema(departmentSchema), "新建部门")
  create(
    @ZodRequest("query", departmentOrgQuerySchema) _query: unknown,
    @ZodRequest("body", createDepartmentSchema) input: CreateDepartment,
    @Req() request: DepartmentRequest,
  ) {
    return this.service.create(
      this.orgId(request),
      input,
      this.actor(),
      this.metadata(request),
    );
  }
  @Patch(":id")
  @RequirePermissions("org:department:update")
  @ApiZodResponse(
    200,
    successResponseSchema(departmentSchema),
    "改名、移动或排序部门",
  )
  update(
    @ZodRequest("query", departmentOrgQuerySchema) _query: unknown,
    @ZodRequest("params", departmentParamsSchema) params: { id: string },
    @ZodRequest("body", updateDepartmentSchema) input: UpdateDepartment,
    @Req() request: DepartmentRequest,
  ) {
    return this.service.update(
      this.orgId(request),
      params.id,
      input,
      this.actor(),
      this.metadata(request),
    );
  }
  @Delete(":id")
  @RequirePermissions("org:department:delete")
  @ApiZodResponse(200, successResponseSchema(z.null()), "软删除空部门")
  remove(
    @ZodRequest("query", departmentOrgQuerySchema) _query: unknown,
    @ZodRequest("params", departmentParamsSchema) params: { id: string },
    @ZodRequest("body", deleteDepartmentSchema) input: DeleteDepartment,
    @Req() request: DepartmentRequest,
  ) {
    return this.service.remove(
      this.orgId(request),
      params.id,
      input.version,
      this.actor(),
      this.metadata(request),
    );
  }
  private actor() {
    return this.cls.get<IdentityContext>("identityContext");
  }
  private orgId(request: DepartmentRequest) {
    if (!request.departmentOrgId) throw new Error("部门管理缺少已验证组织");
    return request.departmentOrgId;
  }
  private metadata(request: DepartmentRequest) {
    return {
      traceId: this.cls.getId(),
      ip: request.socket.remoteAddress ?? "unknown",
      userAgent: request.headers["user-agent"] ?? "",
    };
  }
}

import type { IncomingMessage } from "node:http";
import {
  Controller,
  Get,
  Inject,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  type CreateOrganizationRequest,
  createOrganizationRequestSchema,
  type OrganizationListQuery,
  type OrganizationParams,
  organizationListQuerySchema,
  organizationListSchema,
  organizationParamsSchema,
  organizationSchema,
  successResponseSchema,
  type ToggleOrganizationRequest,
  toggleOrganizationRequestSchema,
  type UpdateOrganizationRequest,
  updateOrganizationRequestSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { Idempotent } from "../../../idempotency.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import {
  CompanyOrganizationGuard,
  type CompanyOrganizationRequest,
} from "./company-organization.guard.js";
import { OrganizationsService } from "./organizations.service.js";

@Controller("api/v1/orgs")
@UseGuards(CompanyOrganizationGuard)
export class OrganizationsController {
  constructor(
    @Inject(OrganizationsService)
    private readonly organizations: OrganizationsService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}

  @RequirePermissions("platform:org:view")
  @Get()
  @ApiZodResponse(
    200,
    successResponseSchema(organizationListSchema),
    "组织列表",
  )
  list(
    @ZodRequest("query", organizationListQuerySchema)
    query: OrganizationListQuery,
  ) {
    return this.organizations.list(query);
  }

  @RequirePermissions("platform:org:create")
  @Post()
  @Idempotent(
    "organization.create",
    (context) =>
      context.switchToHttp().getRequest<CompanyOrganizationRequest>()
        .companyActor?.identityId,
  )
  @ApiZodResponse(
    201,
    successResponseSchema(organizationSchema),
    "新建教育局或代理商",
  )
  create(
    @ZodRequest("body", createOrganizationRequestSchema)
    input: CreateOrganizationRequest,
    @Req() request: CompanyOrganizationRequest,
  ) {
    return this.organizations.create(
      input,
      this.actor(request),
      this.metadata(request),
    );
  }

  @RequirePermissions("platform:org:update")
  @Patch(":id")
  @ApiZodResponse(200, successResponseSchema(organizationSchema), "修改组织")
  update(
    @ZodRequest("params", organizationParamsSchema)
    params: OrganizationParams,
    @ZodRequest("body", updateOrganizationRequestSchema)
    input: UpdateOrganizationRequest,
    @Req() request: CompanyOrganizationRequest,
  ) {
    return this.organizations.update(
      params.id,
      input,
      this.actor(request),
      this.metadata(request),
    );
  }

  @RequirePermissions("platform:org:update")
  @Post(":id/toggle")
  @ApiZodResponse(
    200,
    successResponseSchema(organizationSchema),
    "启用或停用组织",
  )
  toggle(
    @ZodRequest("params", organizationParamsSchema)
    params: OrganizationParams,
    @ZodRequest("body", toggleOrganizationRequestSchema)
    input: ToggleOrganizationRequest,
    @Req() request: CompanyOrganizationRequest,
  ) {
    return this.organizations.toggle(
      params.id,
      input,
      this.actor(request),
      this.metadata(request),
    );
  }

  private actor(request: CompanyOrganizationRequest) {
    if (!request.companyActor) throw new Error("组织管理缺少公司身份上下文");
    return request.companyActor;
  }

  private metadata(request: IncomingMessage) {
    return {
      traceId: this.cls.getId(),
      ip: request.socket.remoteAddress ?? "unknown",
      userAgent: request.headers["user-agent"] ?? "",
    };
  }
}

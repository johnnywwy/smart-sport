import {
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  type CreateMember,
  createMemberResponseSchema,
  createMemberSchema,
  type MemberListQuery,
  memberDetailSchema,
  memberListQuerySchema,
  memberListSchema,
  memberOrgQuerySchema,
  memberParamsSchema,
  memberSchema,
  type SetMemberStatus,
  setMemberStatusSchema,
  successResponseSchema,
  type UpdateMember,
  updateMemberSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { Idempotent } from "../../../idempotency.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../identity-context/index.js";
import {
  MemberOrganizationGuard,
  type MembersRequest,
} from "./member-organization.guard.js";
import { MembersService } from "./members.service.js";
@Controller("api/v1/members")
@UseGuards(MemberOrganizationGuard)
export class MembersController {
  constructor(
    @Inject(MembersService) private readonly service: MembersService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Get()
  @RequirePermissions("org:member:view")
  @ApiZodResponse(
    200,
    successResponseSchema(memberListSchema),
    "组织成员分页列表",
  )
  list(
    @ZodRequest("query", memberListQuerySchema) query: MemberListQuery,
    @Req() request: MembersRequest,
  ) {
    return this.service.list(this.orgId(request), query, this.actor());
  }
  @Get(":id")
  @RequirePermissions("org:member:view")
  @ApiZodResponse(
    200,
    successResponseSchema(memberDetailSchema),
    "成员身份与只读其他组织摘要",
  )
  detail(
    @ZodRequest("query", memberOrgQuerySchema) _query: unknown,
    @ZodRequest("params", memberParamsSchema) params: { id: string },
    @Req() request: MembersRequest,
  ) {
    return this.service.detail(this.orgId(request), params.id, this.actor());
  }
  @Post()
  @Header("Cache-Control", "no-store")
  @RequirePermissions("org:member:create")
  @Idempotent("member.create", (context) => {
    const r = context.switchToHttp().getRequest<MembersRequest>();
    return `${r.auth?.identityId}:${r.membersOrgId}`;
  })
  @ApiZodResponse(
    201,
    successResponseSchema(createMemberResponseSchema),
    "新建账号或追加组织身份",
  )
  create(
    @ZodRequest("query", memberOrgQuerySchema) _query: unknown,
    @ZodRequest("body", createMemberSchema) input: CreateMember,
    @Req() request: MembersRequest,
  ) {
    return this.service.create(
      this.orgId(request),
      input,
      this.actor(),
      this.metadata(request),
    );
  }
  @Patch(":id")
  @RequirePermissions("org:member:update")
  @ApiZodResponse(
    200,
    successResponseSchema(memberSchema),
    "调整成员部门职务与角色",
  )
  update(
    @ZodRequest("query", memberOrgQuerySchema) _query: unknown,
    @ZodRequest("params", memberParamsSchema) params: { id: string },
    @ZodRequest("body", updateMemberSchema) input: UpdateMember,
    @Req() request: MembersRequest,
  ) {
    return this.service.update(
      this.orgId(request),
      params.id,
      input,
      this.actor(),
      this.metadata(request),
    );
  }
  @Post(":id/status")
  @HttpCode(200)
  @RequirePermissions("org:member:update")
  @ApiZodResponse(
    200,
    successResponseSchema(memberSchema),
    "启用或停用本组织身份",
  )
  status(
    @ZodRequest("query", memberOrgQuerySchema) _query: unknown,
    @ZodRequest("params", memberParamsSchema) params: { id: string },
    @ZodRequest("body", setMemberStatusSchema) input: SetMemberStatus,
    @Req() request: MembersRequest,
  ) {
    return this.service.status(
      this.orgId(request),
      params.id,
      input,
      this.actor(),
      this.metadata(request),
    );
  }
  private actor() {
    return this.cls.get<IdentityContext>("identityContext");
  }
  private orgId(request: MembersRequest) {
    if (!request.membersOrgId) throw new Error("成员管理缺少已验证组织");
    return request.membersOrgId;
  }
  private metadata(request: MembersRequest) {
    return {
      traceId: this.cls.getId(),
      ip: request.socket.remoteAddress ?? "unknown",
      userAgent: request.headers["user-agent"] ?? "",
    };
  }
}

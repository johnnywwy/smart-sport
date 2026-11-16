import { Controller, Get, Inject, Put, Req, UseGuards } from "@nestjs/common";
import {
  identityScopeDetailsSchema,
  identityScopeParamsSchema,
  identityScopesSchema,
  memberOrgQuerySchema,
  type ScopeOptionsQuery,
  type SetIdentityScopes,
  scopeOptionsQuerySchema,
  scopeOptionsSchema,
  setIdentityScopesSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { Idempotent } from "../../../idempotency.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../identity-context/index.js";
import { IdentityScopesService } from "./identity-scopes.service.js";
import {
  MemberOrganizationGuard,
  type MembersRequest,
} from "./member-organization.guard.js";

@Controller("api/v1/identities")
@UseGuards(MemberOrganizationGuard)
export class IdentityScopesController {
  constructor(
    @Inject(IdentityScopesService)
    private readonly service: IdentityScopesService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Get(":id/scopes")
  @RequirePermissions("org:member:view")
  @ApiZodResponse(
    200,
    successResponseSchema(identityScopeDetailsSchema),
    "本人额外负责详情与编辑能力",
  )
  get(
    @ZodRequest("query", memberOrgQuerySchema) _query: unknown,
    @ZodRequest("params", identityScopeParamsSchema) params: { id: string },
    @Req() request: MembersRequest,
  ) {
    if (!request.membersOrgId) throw new Error("范围管理缺少已验证组织");
    return this.service.get(
      request.membersOrgId,
      params.id,
      this.cls.get<IdentityContext>("identityContext"),
    );
  }
  @Get(":id/scope-options")
  @RequirePermissions("org:member:update")
  @ApiZodResponse(
    200,
    successResponseSchema(scopeOptionsSchema),
    "可管理成员的边界内范围候选",
  )
  options(
    @ZodRequest("query", scopeOptionsQuerySchema) query: ScopeOptionsQuery,
    @ZodRequest("params", identityScopeParamsSchema) params: { id: string },
    @Req() request: MembersRequest,
  ) {
    if (!request.membersOrgId) throw new Error("范围管理缺少已验证组织");
    return this.service.options(
      request.membersOrgId,
      params.id,
      query,
      this.cls.get<IdentityContext>("identityContext"),
    );
  }
  @Put(":id/scopes")
  @RequirePermissions("org:member:update")
  @Idempotent("identity.scopes.update", (context) => {
    const r = context
      .switchToHttp()
      .getRequest<MembersRequest & { params: { id: string } }>();
    return `${r.auth?.identityId}:${r.membersOrgId?.toLowerCase()}:${r.params.id.toLowerCase()}`;
  })
  @ApiZodResponse(
    200,
    successResponseSchema(identityScopesSchema),
    "整体替换本人额外负责范围",
  )
  set(
    @ZodRequest("query", memberOrgQuerySchema) _query: unknown,
    @ZodRequest("params", identityScopeParamsSchema) params: { id: string },
    @ZodRequest("body", setIdentityScopesSchema) input: SetIdentityScopes,
    @Req() request: MembersRequest,
  ) {
    if (!request.membersOrgId) throw new Error("范围管理缺少已验证组织");
    return this.service.set(
      request.membersOrgId,
      params.id,
      input,
      this.cls.get<IdentityContext>("identityContext"),
      {
        traceId: this.cls.getId(),
        ip: request.socket.remoteAddress ?? "unknown",
        userAgent: request.headers["user-agent"] ?? "",
      },
    );
  }
}

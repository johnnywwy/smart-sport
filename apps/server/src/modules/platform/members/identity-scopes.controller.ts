import { Controller, Inject, Put, Req, UseGuards } from "@nestjs/common";
import {
  identityScopeParamsSchema,
  identityScopesSchema,
  memberOrgQuerySchema,
  type SetIdentityScopes,
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

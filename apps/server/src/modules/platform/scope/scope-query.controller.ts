import { Controller, Get, HttpCode, Inject, Post } from "@nestjs/common";
import {
  type IdentityVisibleQuery,
  identityVisibleParamsSchema,
  identityVisibleQuerySchema,
  identityVisibleSchema,
  type ScopePreviewRequest,
  type ScopeSchoolsQuery,
  scopePreviewRequestSchema,
  scopePreviewSchema,
  scopeSchoolsQuerySchema,
  scopeSchoolsSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../identity-context/index.js";
import { ScopeQueryService } from "./scope-query.service.js";

@Controller("api/v1")
export class ScopeQueryController {
  constructor(
    @Inject(ScopeQueryService) private readonly service: ScopeQueryService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  // 登录级学校选择入口：所请求动作的权限在 Service 按动态 permission 再核对。
  @Get("scope/schools")
  @ApiZodResponse(
    200,
    successResponseSchema(scopeSchoolsSchema),
    "当前身份按动作可见的学校",
  )
  schools(
    @ZodRequest("query", scopeSchoolsQuerySchema) query: ScopeSchoolsQuery,
  ) {
    return this.service.schools(this.actor(), query);
  }
  @Get("identities/:id/visible")
  @RequirePermissions("org:member:view")
  @ApiZodResponse(
    200,
    successResponseSchema(identityVisibleSchema),
    "成员实际可见学校与计算过程",
  )
  visible(
    @ZodRequest("params", identityVisibleParamsSchema) params: { id: string },
    @ZodRequest("query", identityVisibleQuerySchema)
    query: IdentityVisibleQuery,
  ) {
    return this.service.visible(this.actor(), params.id, query);
  }
  @Post("scope/preview")
  @HttpCode(200)
  @RequirePermissions("org:role:view")
  @ApiZodResponse(
    200,
    successResponseSchema(scopePreviewSchema),
    "未保存配置的可见学校去重预览",
  )
  preview(
    @ZodRequest("body", scopePreviewRequestSchema) input: ScopePreviewRequest,
  ) {
    return this.service.preview(this.actor(), input);
  }
  private actor() {
    return this.cls.get<IdentityContext>("identityContext");
  }
}

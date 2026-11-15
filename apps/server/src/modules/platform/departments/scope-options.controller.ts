import { Controller, Get, Inject } from "@nestjs/common";
import {
  type ScopeOptionsQuery,
  scopeOptionsQuerySchema,
  scopeOptionsSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../identity-context/index.js";
import { DepartmentScopesService } from "./department-scopes.service.js";

@Controller("api/v1/scope-options")
export class ScopeOptionsController {
  constructor(
    @Inject(DepartmentScopesService)
    private readonly service: DepartmentScopesService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Get()
  @RequirePermissions("org:department:update")
  @ApiZodResponse(
    200,
    successResponseSchema(scopeOptionsSchema),
    "目标组织边界内的可选范围",
  )
  list(@ZodRequest("query", scopeOptionsQuerySchema) query: ScopeOptionsQuery) {
    return this.service.options(
      query,
      this.cls.get<IdentityContext>("identityContext"),
    );
  }
}

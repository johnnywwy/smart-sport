import { Controller, Get, Inject } from "@nestjs/common";
import {
  type SubscriptionQuery,
  schoolAppsSchema,
  subscriptionDetailSchema,
  subscriptionParamsSchema,
  subscriptionQuerySchema,
  subscriptionsSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { SchoolScoped } from "../../../core/school-scoped.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../identity-context/index.js";
import { SubscriptionsService } from "./subscriptions.service.js";
@Controller("api/v1/subscriptions")
@RequirePermissions("platform:subscription:view")
export class SubscriptionsController {
  constructor(
    @Inject(SubscriptionsService)
    private readonly service: SubscriptionsService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Get()
  @ApiZodResponse(
    200,
    successResponseSchema(subscriptionsSchema),
    "可见学校的服务列表",
  )
  list(@ZodRequest("query", subscriptionQuerySchema) query: SubscriptionQuery) {
    return this.service.list(
      this.cls.get<IdentityContext>("identityContext"),
      query,
    );
  }
  @Get(":schoolId")
  @ApiZodResponse(
    200,
    successResponseSchema(subscriptionDetailSchema),
    "学校服务、应用及历史",
  )
  detail(
    @ZodRequest("params", subscriptionParamsSchema) params: {
      schoolId: string;
    },
  ) {
    return this.service.detail(
      this.cls.get<IdentityContext>("identityContext"),
      params.schoolId,
    );
  }
}
@Controller("api/v1/schools/:schoolId/apps")
@SchoolScoped()
export class SchoolAppsController {
  constructor(
    @Inject(SubscriptionsService)
    private readonly service: SubscriptionsService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Get()
  @ApiZodResponse(
    200,
    successResponseSchema(schoolAppsSchema),
    "可见学校当前可用应用；不授予业务权限",
  )
  apps(
    @ZodRequest("params", subscriptionParamsSchema) params: {
      schoolId: string;
    },
  ) {
    return this.service.schoolApps(
      this.cls.get<IdentityContext>("identityContext"),
      params.schoolId,
    );
  }
}

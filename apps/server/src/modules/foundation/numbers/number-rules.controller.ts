import type { IncomingMessage } from "node:http";
import { Controller, Get, Inject, Patch, Req } from "@nestjs/common";
import {
  numberRuleListSchema,
  numberRuleParamsSchema,
  numberRuleQuerySchema,
  numberRuleSchema,
  successResponseSchema,
  type UpdateNumberRule,
  updateNumberRuleSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../../platform/identity-context/index.js";
import { NumberRulesService } from "./number-rules.service.js";

@Controller("api/v1/number-rules")
export class NumberRulesController {
  constructor(
    @Inject(NumberRulesService) private readonly service: NumberRulesService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Get()
  @RequirePermissions("system:number:view")
  @ApiZodResponse(
    200,
    successResponseSchema(numberRuleListSchema),
    "编号规则与非占用预览",
  )
  list(@ZodRequest("query", numberRuleQuerySchema) _query: unknown) {
    return this.service.list(this.cls.get<IdentityContext>("identityContext"));
  }
  @Patch(":id")
  @RequirePermissions("system:number:update")
  @ApiZodResponse(
    200,
    successResponseSchema(numberRuleSchema),
    "修改之后生成的编号格式",
  )
  update(
    @ZodRequest("params", numberRuleParamsSchema) params: { id: string },
    @ZodRequest("body", updateNumberRuleSchema) input: UpdateNumberRule,
    @Req() request: IncomingMessage,
  ) {
    return this.service.update(
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

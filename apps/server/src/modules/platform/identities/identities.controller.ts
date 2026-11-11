import type { IncomingMessage } from "node:http";
import { Controller, Get, Inject, Post, Req } from "@nestjs/common";
import {
  authSessionSchema,
  identityListSchema,
  type SelectIdentityRequest,
  selectIdentityRequestSchema,
  selectIdentityResponseSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { AccountAllowed } from "../../../core/auth-policy.js";
import type { AuthenticatedRequest } from "../../../core/authenticated.guard.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import { IdentitiesService } from "./identities.service.js";

@Controller("api/v1/auth")
@AccountAllowed()
export class IdentitiesController {
  constructor(
    @Inject(IdentitiesService) private readonly identities: IdentitiesService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}

  @Get("session")
  @ApiZodResponse(
    200,
    successResponseSchema(authSessionSchema),
    "恢复当前服务端会话上下文",
  )
  session(@Req() request: AuthenticatedRequest) {
    return this.identities.session(this.claims(request));
  }

  @Get("identities")
  @ApiZodResponse(
    200,
    successResponseSchema(identityListSchema),
    "列出当前账号身份",
  )
  list(@Req() request: AuthenticatedRequest) {
    return this.identities.list(this.claims(request));
  }

  @Post("select-identity")
  @ApiZodResponse(
    201,
    successResponseSchema(selectIdentityResponseSchema),
    "选择或切换身份",
  )
  select(
    @ZodRequest("body", selectIdentityRequestSchema)
    input: SelectIdentityRequest,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.identities.select(
      this.claims(request),
      input,
      this.metadata(request),
    );
  }

  private claims(request: AuthenticatedRequest) {
    if (!request.auth) throw new Error("认证守卫未写入令牌上下文");
    return request.auth;
  }

  private metadata(request: IncomingMessage) {
    return {
      ip: request.socket.remoteAddress ?? "unknown",
      userAgent: request.headers["user-agent"] ?? "",
      traceId: this.cls.getId(),
    };
  }
}

import type { IncomingMessage, ServerResponse } from "node:http";
import { Controller, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import type { ServerConfig } from "@smart-sport/config/env";
import {
  type LoginRequest,
  loginRequestSchema,
  loginResponseSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { SERVER_CONFIG } from "../../../server-config.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import { AuthService } from "./auth.service.js";

@Controller("api/v1/auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}

  @Post("login")
  @HttpCode(200)
  @ApiZodResponse(
    200,
    successResponseSchema(loginResponseSchema),
    "账号密码登录",
  )
  async login(
    @ZodRequest("body", loginRequestSchema) input: LoginRequest,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const result = await this.auth.login(input, {
      ip: request.socket.remoteAddress ?? "unknown",
      userAgent: request.headers["user-agent"] ?? "",
      traceId: this.cls.getId(),
    });
    response.setHeader(
      "Set-Cookie",
      `refresh_token=${result.refreshToken}; Path=/api/v1/auth; HttpOnly; SameSite=Strict; Max-Age=604800${this.config.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return result.body;
  }
}

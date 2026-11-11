import type { IncomingMessage, ServerResponse } from "node:http";
import { Controller, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import type { ServerConfig } from "@smart-sport/config/env";
import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  emptyResultSchema,
  type LoginRequest,
  loginRequestSchema,
  loginResponseSchema,
  refreshAccessTokenSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { ApiException } from "../../../api-response.js";
import { AccountAllowed, PublicRoute } from "../../../core/auth-policy.js";
import { SERVER_CONFIG } from "../../../server-config.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import { AuthService } from "./auth.service.js";
import { readRefreshCookie, writeRefreshCookie } from "./refresh-cookie.js";

@Controller("api/v1/auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}

  @PublicRoute()
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
    writeRefreshCookie(
      response,
      result.refreshToken,
      this.config.NODE_ENV === "production",
    );
    return result.body;
  }
  @PublicRoute()
  @Post("refresh")
  @HttpCode(200)
  @ApiZodResponse(
    200,
    successResponseSchema(refreshAccessTokenSchema),
    "轮换刷新令牌",
  )
  async refresh(
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    try {
      const result = await this.auth.refresh(
        readRefreshCookie(request.headers.cookie),
      );
      writeRefreshCookie(
        response,
        result.refreshToken,
        this.config.NODE_ENV === "production",
        result.maxAge,
      );
      return result.body;
    } catch (error) {
      if (error instanceof ApiException && error.code === 10005)
        writeRefreshCookie(
          response,
          null,
          this.config.NODE_ENV === "production",
        );
      throw error;
    }
  }

  @PublicRoute()
  @Post("logout")
  @HttpCode(200)
  @ApiZodResponse(200, successResponseSchema(emptyResultSchema), "退出当前会话")
  async logout(
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    await this.auth.logout(readRefreshCookie(request.headers.cookie), {
      ip: request.socket.remoteAddress ?? "unknown",
      userAgent: request.headers["user-agent"] ?? "",
      traceId: this.cls.getId(),
    });
    writeRefreshCookie(response, null, this.config.NODE_ENV === "production");
    return null;
  }

  @AccountAllowed()
  @Post("change-password")
  @HttpCode(200)
  @ApiZodResponse(
    200,
    successResponseSchema(emptyResultSchema),
    "修改当前账号密码",
  )
  async changePassword(
    @ZodRequest("body", changePasswordRequestSchema)
    input: ChangePasswordRequest,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    try {
      await this.auth.changePassword(
        readRefreshCookie(request.headers.cookie),
        readBearerToken(request.headers.authorization),
        input,
        {
          ip: request.socket.remoteAddress ?? "unknown",
          userAgent: request.headers["user-agent"] ?? "",
          traceId: this.cls.getId(),
        },
      );
      response.setHeader("Cache-Control", "no-store");
      return null;
    } catch (error) {
      if (error instanceof ApiException && error.code === 10005) {
        writeRefreshCookie(
          response,
          null,
          this.config.NODE_ENV === "production",
        );
      }
      throw error;
    }
  }
}

function readBearerToken(header: string | undefined) {
  const match =
    /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(
      header ?? "",
    );
  return match?.[1];
}

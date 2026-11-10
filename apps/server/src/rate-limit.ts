import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ServerConfig } from "@smart-sport/config/env";
import { Redis } from "ioredis";
import { ClsService } from "nestjs-cls";
import { ApiException } from "./api-response.js";
import { SERVER_CONFIG } from "./server-config.js";

const SKIP_RATE_LIMIT = Symbol("SKIP_RATE_LIMIT");
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT, true);
const minuteMs = 60_000;

// Keep the first request's window. Rejected requests do not extend it.
const consume = `
  local count = tonumber(redis.call('GET', KEYS[1]) or '0')
  if count >= tonumber(ARGV[1]) then
    return redis.call('PTTL', KEYS[1])
  end
  if redis.call('INCR', KEYS[1]) == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[2])
  end
  return -3
`;

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly redis: Redis;

  constructor(
    @Inject(SERVER_CONFIG) config: ServerConfig,
    @Inject(ClsService) private readonly cls: ClsService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {
    this.redis = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 2000,
      commandTimeout: 2000,
      maxRetriesPerRequest: 0,
    });
    this.redis.on("error", () => {});
  }

  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;

    const http = context.switchToHttp();
    const request = http.getRequest<IncomingMessage & { path: string }>();
    const response = http.getResponse<ServerResponse>();
    // Trust the socket peer until a trusted proxy policy is configured.
    const ip = request.socket.remoteAddress ?? "unknown";
    const identityId = this.cls.get<string | undefined>("identityId");
    await this.check(
      "global",
      identityId ? `identity:${identityId}` : `ip:${ip}`,
      300,
      response,
    );

    if (
      request.method === "POST" &&
      /^\/api\/v1\/auth\/login\/?$/i.test(request.path)
    ) {
      await this.check("login", ip, 10, response);
    }
    return true;
  }

  private async check(
    bucket: string,
    tracker: string,
    limit: number,
    response: ServerResponse,
  ) {
    const digest = createHash("sha256").update(tracker).digest("hex");
    let remainingMs: unknown;
    try {
      remainingMs = await this.redis.eval(
        consume,
        1,
        `smart-sport:rate:v1:${bucket}:${digest}`,
        limit,
        minuteMs,
      );
    } catch {
      throw new ServiceUnavailableException();
    }
    if (remainingMs === -3) return;
    if (typeof remainingMs !== "number" || remainingMs < 0)
      throw new ServiceUnavailableException();
    response.setHeader(
      "Retry-After",
      Math.max(1, Math.ceil(remainingMs / 1000)),
    );
    throw new ApiException(90005);
  }

  onApplicationShutdown() {
    this.redis.disconnect();
  }
}

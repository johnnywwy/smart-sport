import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  ServiceUnavailableException,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ServerConfig } from "@smart-sport/config/env";
import { Redis } from "ioredis";
import { defer, lastValueFrom } from "rxjs";
import { z } from "zod";
import { ApiException, invalidRequest } from "./api-response.js";
import { SERVER_CONFIG } from "./server-config.js";

const IDEMPOTENCY_SCOPE = Symbol("IDEMPOTENCY_SCOPE");
const ttlSeconds = 24 * 60 * 60;
const keySchema = z.uuid();

type ResolveScope = (context: ExecutionContext) => string | undefined;

/** Resolve a stable, server-verified identity scope after authorization. */
export const Idempotent = (operation: string, resolveScope: ResolveScope) =>
  SetMetadata(IDEMPOTENCY_SCOPE, { operation, resolveScope });

const saveResult = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
`;

async function redisOperation<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch {
    throw new ServiceUnavailableException();
  }
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const policy = this.reflector.get<
      { operation: string; resolveScope: ResolveScope } | undefined
    >(IDEMPOTENCY_SCOPE, context.getHandler());
    if (!policy) return next.handle();

    return defer(async () => {
      const request = context.switchToHttp().getRequest<IncomingMessage>();
      const key = keySchema.safeParse(request.headers["idempotency-key"]);
      if (!key.success) throw invalidRequest([{ path: ["Idempotency-Key"] }]);
      const scope = policy.resolveScope(context);
      if (!scope) throw new ApiException(90004);

      const digest = createHash("sha256")
        .update(
          JSON.stringify([
            scope,
            request.method,
            policy.operation,
            key.data.toLowerCase(),
          ]),
        )
        .digest("hex");
      return this.execute(`smart-sport:idempotency:v1:${digest}`, next);
    });
  }

  private async execute(key: string, next: CallHandler) {
    const redis = new Redis(this.config.REDIS_URL, {
      lazyConnect: true,
      enableReadyCheck: false,
      retryStrategy: () => null,
      connectTimeout: 2000,
      commandTimeout: 2000,
    });
    redis.on("error", () => {});
    const pending = `pending:${randomUUID()}`;
    try {
      await redisOperation(() => redis.connect());
      const claimed = await redisOperation(() =>
        redis.set(key, pending, "EX", ttlSeconds, "NX"),
      );
      if (!claimed) {
        const stored = await redisOperation(() => redis.get(key));
        const result = await redisOperation(async () =>
          stored?.startsWith("result:")
            ? (JSON.parse(stored.slice(7)) as unknown)
            : { pending: true },
        );
        throw new ApiException(90003, result);
      }

      // Retain the claim on failure. A handler may have committed before throwing.
      const result: unknown = await lastValueFrom(next.handle());
      const saved = await redisOperation(async () => {
        const payload = `result:${JSON.stringify(result ?? null)}`;
        return redis.eval(saveResult, 1, key, pending, payload, ttlSeconds);
      });
      if (saved !== 1) throw new ServiceUnavailableException();
      return result;
    } finally {
      redis.disconnect();
    }
  }
}

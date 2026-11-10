import type { ServerResponse } from "node:http";
import { ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";
import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { ServerConfig } from "@smart-sport/config/env";
import type { Readiness } from "@smart-sport/contracts";
import { Redis } from "ioredis";
import pg from "pg";

export const SERVER_CONFIG = Symbol("SERVER_CONFIG");
const timeoutMs = 2000;

async function postgresReady(config: ServerConfig) {
  const client = new pg.Client({
    connectionString: config.DATABASE_URL,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
  });
  // pg can emit a connection error between the query and client shutdown.
  client.on("error", () => {});
  try {
    await client.connect();
    await client.query("SELECT 1");
  } finally {
    await client.end();
  }
}

async function redisReady(config: ServerConfig) {
  const client = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    enableReadyCheck: false,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    connectTimeout: timeoutMs,
    commandTimeout: timeoutMs,
  });
  client.on("error", () => {});
  try {
    await client.connect();
    await client.ping();
  } finally {
    client.disconnect();
  }
}

async function minioReady(config: ServerConfig) {
  const client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
  });
  try {
    await client.send(new ListBucketsCommand({}), {
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
  } finally {
    client.destroy();
  }
}

async function check(probe: Promise<void>) {
  try {
    await probe;
    return true;
  } catch {
    return false;
  }
}

@Controller("health")
export class HealthController {
  private pending: Promise<Readiness> | undefined;

  constructor(@Inject(SERVER_CONFIG) private readonly config: ServerConfig) {}

  @Get("live")
  live() {
    return { status: "alive" };
  }

  @Get("ready")
  async ready(@Res({ passthrough: true }) response: ServerResponse) {
    this.pending ??= this.probe().finally(() => {
      this.pending = undefined;
    });
    const result = await this.pending;
    response.statusCode = result.status === "ready" ? 200 : 503;
    return result;
  }

  private async probe(): Promise<Readiness> {
    const [postgres, redis, minio] = await Promise.all([
      check(postgresReady(this.config)),
      check(redisReady(this.config)),
      check(minioReady(this.config)),
    ]);
    return {
      status: postgres && redis && minio ? "ready" : "unavailable",
      checks: { postgres, redis, minio },
    };
  }
}

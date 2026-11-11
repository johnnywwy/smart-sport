import { setTimeout as delay } from "node:timers/promises";
import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { WorkerConfig } from "@smart-sport/config/env";
import { createLoggerOptions } from "@smart-sport/config/logger";
import { UnrecoverableError, Worker } from "bullmq";
import { Redis } from "ioredis";
import { pino } from "pino";
import { z } from "zod";

export const WORKER_CONFIG = Symbol("WORKER_CONFIG");
export const probeQueue = "probe";
const probeSchema = z.object({ delayMs: z.int().min(0).max(2000).default(0) });

@Injectable()
export class QueueWorker implements BeforeApplicationShutdown {
  private readonly logger: ReturnType<typeof pino>;
  private readonly connection: Redis;
  private worker?: Worker;
  private stopping: Promise<void> | undefined;

  constructor(@Inject(WORKER_CONFIG) private readonly config: WorkerConfig) {
    this.logger = pino(
      createLoggerOptions(
        config.NODE_ENV,
        "smart-sport-worker",
        Boolean(process.stdout.isTTY),
      ),
    );
    this.connection = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: null,
    });
    this.connection.on("error", () => this.logger.warn("Redis 连接异常"));
  }

  async start() {
    await this.connection.connect();
    if (this.stopping) return;

    const worker = new Worker(
      probeQueue,
      async (job) => {
        const parsed = probeSchema.safeParse(job.data);
        if (job.name !== "ping" || !parsed.success) {
          throw new UnrecoverableError("未知任务或任务参数无效");
        }
        if (parsed.data.delayMs) await delay(parsed.data.delayMs);
        return { status: "ok" };
      },
      {
        connection: this.connection,
        prefix: this.config.WORKER_QUEUE_PREFIX,
        autorun: false,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
    );
    this.worker = worker;
    worker.on("error", () => this.logger.error("BullMQ worker 运行异常"));
    await worker.waitUntilReady();
    if (this.stopping) return;

    this.logger.info({ queue: probeQueue }, "队列消费者已就绪");
    void worker
      .run()
      .catch(async () => {
        this.logger.error("BullMQ 消费循环终止");
        process.exitCode = 1;
        await this.beforeApplicationShutdown();
      })
      .catch(() => this.logger.error("队列资源关闭失败"));
  }

  beforeApplicationShutdown() {
    this.stopping ??= this.stop();
    return this.stopping;
  }

  private async stop() {
    try {
      // close() stops fetching jobs and waits for active jobs to finish.
      await this.worker?.close();
    } finally {
      this.connection.disconnect();
    }
  }
}

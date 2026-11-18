import type { DatabaseConfig, WorkerConfig } from "@smart-sport/config/env";
import { createLoggerOptions } from "@smart-sport/config/logger";
import {
  createSubscriptionLifecycle,
  DataSourceRegistry,
} from "@smart-sport/server";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { pino } from "pino";
export const subscriptionStatusQueue = "subscription-status";
/** 每日上海01:00重算，启动补算；多实例由数据库锁确保同一状态只记一次。 */
export class SubscriptionStatusWorker {
  private readonly sources: DataSourceRegistry;
  private readonly lifecycle: ReturnType<typeof createSubscriptionLifecycle>;
  private readonly connection: Redis;
  private readonly logger: ReturnType<typeof pino>;
  private queue: Queue | undefined;
  private worker: Worker | undefined;
  private startup: Promise<void> | undefined;
  private stopping: Promise<void> | undefined;
  constructor(
    private readonly config: WorkerConfig,
    database: DatabaseConfig,
  ) {
    this.sources = new DataSourceRegistry(database);
    this.lifecycle = createSubscriptionLifecycle(this.sources);
    this.connection = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    this.connection.on("error", () => {});
    this.logger = pino(
      createLoggerOptions(
        config.NODE_ENV,
        "subscription-status",
        Boolean(process.stdout.isTTY),
      ),
    );
  }
  async start() {
    await this.connection.connect();
    this.queue = new Queue(subscriptionStatusQueue, {
      connection: this.connection,
      prefix: this.config.WORKER_QUEUE_PREFIX,
    });
    this.worker = new Worker(
      subscriptionStatusQueue,
      async () => this.reconcile(),
      {
        connection: this.connection,
        prefix: this.config.WORKER_QUEUE_PREFIX,
        concurrency: 1,
      },
    );
    this.worker.on("error", () => this.logger.error("学校服务状态队列异常"));
    this.worker.on("failed", () =>
      this.logger.error("学校服务状态批次失败，等待重试"),
    );
    await this.queue.upsertJobScheduler(
      "daily-shanghai-0100",
      { pattern: "0 0 1 * * *", tz: "Asia/Shanghai" },
      {
        name: "reconcile",
        data: {},
        opts: {
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      },
    );
    this.startup = this.reconcile().then(() => undefined);
    await this.startup;
    this.logger.info("学校服务每日状态任务已就绪");
  }
  private async reconcile() {
    const result = await this.lifecycle.reconcileAll((schoolId) =>
      this.logger.error(
        { schoolId },
        "学校服务状态处理失败，保留原状态等待重试",
      ),
    );
    if (result.failed) throw new Error("部分学校服务状态处理失败");
    return result;
  }
  beforeApplicationShutdown() {
    this.stopping ??= this.stop();
    return this.stopping;
  }
  private async stop() {
    try {
      await this.startup?.catch(() => {});
      await this.worker?.close();
      await this.queue?.close();
    } finally {
      this.connection.disconnect();
      await this.sources.onApplicationShutdown();
    }
  }
}

import type { DatabaseConfig, WorkerConfig } from "@smart-sport/config/env";
import { createLoggerOptions } from "@smart-sport/config/logger";
import {
  DataSourceRegistry,
  provisionJobSchema,
  provisionQueue,
  TenantMigrator,
  TenantRepository,
} from "@smart-sport/server";
import { UnrecoverableError, Worker } from "bullmq";
import { Redis } from "ioredis";
import { pino } from "pino";

/** 仅消费内部开通队列；生产入口待T-142向导授权后投递。 */
export class SchoolProvisionWorker {
  private readonly sources: DataSourceRegistry;
  private readonly connection: Redis;
  private readonly logger: ReturnType<typeof pino>;
  private worker?: Worker;
  private stopping: Promise<void> | undefined;

  constructor(
    private readonly config: WorkerConfig,
    database: DatabaseConfig,
  ) {
    this.sources = new DataSourceRegistry(database);
    this.logger = pino(
      createLoggerOptions(
        config.NODE_ENV,
        "school-provision",
        Boolean(process.stdout.isTTY),
      ),
    );
    this.connection = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: null,
    });
    this.connection.on("error", () => this.logger.warn("学校开通队列连接异常"));
  }

  async start() {
    await this.connection.connect();
    if (this.stopping) return;
    const migrator = new TenantMigrator(
      this.sources,
      new TenantRepository(this.sources.get().db),
    );
    const worker = new Worker(
      provisionQueue,
      async (job) => {
        const parsed = provisionJobSchema.safeParse(job.data);
        if (job.name !== "provision" || !parsed.success) {
          throw new UnrecoverableError("学校开通任务参数无效");
        }
        try {
          const result = await migrator.provisionSchool(
            parsed.data.schoolId,
            parsed.data.datasource
              ? { datasource: parsed.data.datasource }
              : {},
          );
          if (result.status === "failed") throw new Error(result.error);
          return result;
        } catch {
          // BullMQ持久化失败原因，禁止把驱动、SQL、配置原始异常传给队列。
          throw new Error("学校库开通失败，请检查安全失败记录后重试");
        }
      },
      {
        connection: this.connection,
        prefix: this.config.WORKER_QUEUE_PREFIX,
        concurrency: 5,
        autorun: false,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
    );
    this.worker = worker;
    worker.on("error", () => this.logger.error("学校开通消费者运行异常"));
    await worker.waitUntilReady();
    if (this.stopping) return;
    this.logger.info({ queue: provisionQueue }, "学校开通消费者已就绪");
    void worker
      .run()
      .catch(async () => {
        process.exitCode = 1;
        this.logger.error("学校开通消费循环终止");
        await this.beforeApplicationShutdown();
      })
      .catch(() => this.logger.error("学校开通资源关闭失败"));
  }

  beforeApplicationShutdown() {
    this.stopping ??= this.stop();
    return this.stopping;
  }

  private async stop() {
    try {
      await this.worker?.close();
    } finally {
      this.connection.disconnect();
      await this.sources.onApplicationShutdown();
    }
  }
}

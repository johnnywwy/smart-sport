import type { DatabaseConfig, WorkerConfig } from "@smart-sport/config/env";
import { createLoggerOptions } from "@smart-sport/config/logger";
import {
  createOutboxServices,
  DataSourceRegistry,
  type OutboxEvent,
  type OutboxTopic,
  type OutboxTransaction,
  outboxQueue,
  outboxReferenceSchema,
  outboxTopicSchema,
} from "@smart-sport/server";
import { UnrecoverableError, Worker } from "bullmq";
import { Redis } from "ioredis";
import { pino } from "pino";

/** 每主题一个逻辑处理器，可水平扩容；业务写入仅使用传入的目标事务。 */
export class OutboxConsumerWorker {
  private readonly sources: DataSourceRegistry;
  private readonly connection: Redis;
  private readonly logger: ReturnType<typeof pino>;
  private worker?: Worker;
  private stopping?: Promise<void>;
  constructor(
    private readonly config: WorkerConfig,
    database: DatabaseConfig,
    private readonly handler: {
      topic: OutboxTopic;
      consumer: string;
      targetDatasource: string;
      effect: (tx: OutboxTransaction, event: OutboxEvent) => Promise<unknown>;
    },
  ) {
    outboxTopicSchema.parse(handler.topic);
    this.sources = new DataSourceRegistry(database);
    this.sources.get(handler.targetDatasource);
    this.logger = pino(
      createLoggerOptions(
        config.NODE_ENV,
        "outbox-consumer",
        Boolean(process.stdout.isTTY),
      ),
    );
    this.connection = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: null,
    });
    this.connection.on("error", () => this.logger.warn("事件消费队列连接异常"));
  }
  async start() {
    await this.connection.connect();
    if (this.stopping) return;
    const { consumer } = createOutboxServices(this.sources);
    const worker = new Worker(
      outboxQueue(this.handler.topic),
      async (job) => {
        const reference = outboxReferenceSchema.safeParse(job.data);
        if (!reference.success || job.name !== this.handler.topic)
          throw new UnrecoverableError("事件任务参数无效");
        try {
          const result = await consumer.consume(
            this.handler.targetDatasource,
            this.handler.consumer,
            this.handler.topic,
            reference.data,
            this.handler.effect,
          );
          return { duplicate: result.duplicate };
        } catch {
          throw new Error("事件消费失败，请检查安全告警并重试");
        }
      },
      {
        connection: this.connection,
        prefix: this.config.WORKER_QUEUE_PREFIX,
        concurrency: 5,
        autorun: false,
      },
    );
    this.worker = worker;
    worker.on("error", () => this.logger.error("事件消费者运行异常"));
    worker.on("failed", (job) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1))
        this.logger.error(
          {
            alert: "outbox_consumption_exhausted",
            eventJobId: job.id,
            consumer: this.handler.consumer,
          },
          "事件消费重试耗尽，失败任务已保留",
        );
    });
    await worker.waitUntilReady();
    if (this.stopping) return;
    void worker
      .run()
      .catch(async () => {
        process.exitCode = 1;
        this.logger.error("事件消费循环终止");
        await this.beforeApplicationShutdown();
      })
      .catch(() => this.logger.error("事件消费资源关闭失败"));
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

import type { DatabaseConfig, WorkerConfig } from "@smart-sport/config/env";
import { createLoggerOptions } from "@smart-sport/config/logger";
import {
  createOutboxServices,
  DataSourceRegistry,
  type OutboxEvent,
  outboxJobId,
  outboxQueue,
} from "@smart-sport/server";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { pino } from "pino";

/** 只负责已提交事件入队；业务消费者在各模块接入时注册。 */
export class OutboxPublisherWorker {
  private readonly sources: DataSourceRegistry;
  private readonly services: ReturnType<typeof createOutboxServices>;
  private readonly connection: Redis;
  private readonly queues = new Map<string, Queue>();
  private readonly logger: ReturnType<typeof pino>;
  private readonly datasourceAlertAt = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;
  private running: Promise<void> | undefined;
  private stopping?: Promise<void>;
  constructor(
    private readonly config: WorkerConfig,
    database: DatabaseConfig,
  ) {
    this.sources = new DataSourceRegistry(database);
    this.services = createOutboxServices(this.sources);
    this.logger = pino(
      createLoggerOptions(
        config.NODE_ENV,
        "outbox-publisher",
        Boolean(process.stdout.isTTY),
      ),
    );
    this.connection = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      commandTimeout: 3000,
      enableOfflineQueue: false,
    });
    this.connection.on("error", () => {
      /* 由每批安全失败摘要报告，禁止记录连接串。 */
    });
  }
  async start() {
    await this.connection.connect();
    if (this.stopping) return;
    await this.tick();
    if (this.stopping) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 1000);
    this.logger.info("可靠事件投递轮询已就绪");
  }
  private async publish(source: string, event: OutboxEvent) {
    const name = outboxQueue(event.topic);
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection: this.connection,
        prefix: this.config.WORKER_QUEUE_PREFIX,
      });
      this.queues.set(name, queue);
    }
    const reference = { datasource: source, eventId: event.id };
    await queue.add(event.topic, reference, {
      jobId: outboxJobId(reference),
      attempts: 11,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { age: 604800 },
      removeOnFail: false,
    });
  }
  private tick() {
    if (this.running || this.stopping) return this.running;
    this.running = this.services.dispatcher
      .dispatch(
        (source, event) => this.publish(source, event),
        (kind, datasource, eventId) => {
          if (kind === "datasource_unavailable") {
            const now = Date.now();
            if (now - (this.datasourceAlertAt.get(datasource) ?? 0) >= 60_000) {
              this.logger.error(
                { alert: "outbox_datasource_unavailable", datasource },
                "事件来源不可用，请检查迁移与连接",
              );
              this.datasourceAlertAt.set(datasource, now);
            }
          } else
            this.logger.error(
              { alert: "outbox_delivery_exhausted", datasource, eventId },
              "事件投递已超过10次失败，保留记录等待运维处理",
            );
        },
        10,
      )
      .then(() => undefined)
      .catch(() => {
        this.logger.error("事件投递批次异常，等待下次轮询");
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
  beforeApplicationShutdown() {
    this.stopping ??= this.stop();
    return this.stopping;
  }
  private async stop() {
    if (this.timer) clearInterval(this.timer);
    try {
      await this.running;
      await Promise.all(
        [...this.queues.values()].map((queue) => queue.close()),
      );
    } finally {
      this.connection.disconnect();
      await this.sources.onApplicationShutdown();
    }
  }
}

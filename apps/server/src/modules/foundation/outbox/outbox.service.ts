import { Inject, Injectable } from "@nestjs/common";
import {
  idSchema,
  type OutboxEventInput,
  type OutboxReference,
  type OutboxTopic,
  outboxEventInputSchema,
  outboxReferenceSchema,
} from "@smart-sport/contracts";
import { z } from "zod";
import { DataSourceRegistry } from "../../../database/registry.js";
import {
  type OutboxEvent,
  OutboxRepository,
  type OutboxTransaction,
} from "./outbox.repository.js";

const consumerSchema = z
  .string()
  .regex(/^[a-z][a-z0-9._-]*$/)
  .max(100);
export const outboxQueue = (topic: OutboxTopic) =>
  `outbox-${topic.replaceAll(".", "-")}`;
export const outboxJobId = (reference: OutboxReference) =>
  `${reference.datasource}--${reference.eventId}`;
export type { OutboxEvent, OutboxTransaction } from "./outbox.repository.js";

@Injectable()
export class OutboxService {
  constructor(
    @Inject(OutboxRepository) private readonly repository: OutboxRepository,
  ) {}
  /** 调用方已授权的业务事务必须显式传入，不另开事务或直接写Redis。 */
  async append(
    tx: OutboxTransaction,
    input: OutboxEventInput,
    actorId: string | null = null,
  ) {
    const event = outboxEventInputSchema.parse(input);
    const [row] = await this.repository.append(
      tx,
      event,
      actorId ? idSchema.parse(actorId) : null,
    );
    if (!row) throw new Error("事件保存失败");
    return row.id;
  }
  /** 只供内部运维组合使用，不提供公开越权查询入口。 */
  failures(source: string, limit = 100) {
    return this.repository.failures(
      source,
      z.int().min(1).max(100).parse(limit),
    );
  }
}

@Injectable()
export class OutboxDispatcherService {
  constructor(
    @Inject(OutboxRepository) private readonly repository: OutboxRepository,
    @Inject(DataSourceRegistry) private readonly sources: DataSourceRegistry,
  ) {}
  /** 入队与记录提交之间允许重投；故障数据源不阻断其余来源。 */
  async dispatch(
    publish: (source: string, event: OutboxEvent) => Promise<void>,
    report: (
      kind: "dead_letter" | "datasource_unavailable",
      source: string,
      id?: string,
    ) => void,
    batchSize = 50,
  ) {
    z.int().min(1).max(100).parse(batchSize);
    const result = { published: 0, retrying: 0, failed: 0, unavailable: 0 };
    for (const source of this.sources.keys()) {
      try {
        for (let i = 0; i < batchSize; i++) {
          const row = await this.repository.dispatchOne(
            source,
            async (event) => {
              outboxEventInputSchema.parse({
                topic: event.topic,
                schoolId: event.schoolId,
                payload: event.payload,
              });
              await publish(source, event);
            },
          );
          if (!row) break;
          if (row.status === "published") result.published++;
          else if (row.status === "failed") {
            result.failed++;
            report("dead_letter", source, row.id);
          } else result.retrying++;
        }
      } catch {
        result.unavailable++;
        report("datasource_unavailable", source);
      }
    }
    return result;
  }
}

@Injectable()
export class OutboxConsumerService {
  constructor(
    @Inject(OutboxRepository) private readonly repository: OutboxRepository,
  ) {}
  /** 处理器只能在目标事务中写数据库；外部副作用须自行使用事件ID幂等。 */
  async consume<T>(
    target: string,
    consumer: string,
    topic: OutboxTopic,
    input: OutboxReference,
    effect: (tx: OutboxTransaction, event: OutboxEvent) => Promise<T>,
  ) {
    const reference = outboxReferenceSchema.parse(input);
    consumerSchema.parse(consumer);
    const event = await this.repository.event(reference);
    if (!event || event.topic !== topic)
      throw new Error("事件不存在或主题不匹配");
    outboxEventInputSchema.parse({
      topic: event.topic,
      schoolId: event.schoolId,
      payload: event.payload,
    });
    return this.repository.consume(target, consumer, reference, (tx) =>
      effect(tx, event),
    );
  }
}

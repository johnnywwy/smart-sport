import type { DataSourceRegistry } from "../../../database/registry.js";
import { OutboxRepository } from "./outbox.repository.js";
import {
  OutboxConsumerService,
  OutboxDispatcherService,
  OutboxService,
} from "./outbox.service.js";

export {
  OutboxConsumerService,
  OutboxDispatcherService,
  type OutboxEvent,
  OutboxService,
  type OutboxTransaction,
  outboxJobId,
  outboxQueue,
} from "./outbox.service.js";
export const outboxProviders = [
  OutboxRepository,
  OutboxService,
  OutboxDispatcherService,
  OutboxConsumerService,
];
/** 非HTTP worker的装配入口，避免引用其他模块仓储。 */
export function createOutboxServices(sources: DataSourceRegistry) {
  const repository = new OutboxRepository(sources);
  return {
    writer: new OutboxService(repository),
    dispatcher: new OutboxDispatcherService(repository, sources),
    consumer: new OutboxConsumerService(repository),
  };
}

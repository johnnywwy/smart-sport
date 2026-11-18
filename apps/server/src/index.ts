/** worker通过公开入口复用基础设施和服务，不启动HTTP应用。 */

export {
  type OutboxTopic,
  outboxReferenceSchema,
  outboxTopicSchema,
} from "@smart-sport/contracts";
export { DataSourceRegistry } from "./database/registry.js";
export { TenantMigrator, TenantRepository } from "./infra/tenant/index.js";
export { ProvisionRepository } from "./infra/tenant/provision.repository.js";
export {
  provisionJobSchema,
  provisionQueue,
} from "./infra/tenant/provision-job.js";
export {
  createOutboxServices,
  OutboxConsumerService,
  OutboxDispatcherService,
  type OutboxEvent,
  OutboxService,
  type OutboxTransaction,
  outboxJobId,
  outboxQueue,
} from "./modules/foundation/outbox/index.js";

export { createSubscriptionLifecycle } from "./modules/platform/subscription/index.js";

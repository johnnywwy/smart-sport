import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { DataSourceRegistry } from "../../../database/registry.js";
import {
  NumbersRepository,
  NumbersService,
} from "../../foundation/numbers/index.js";
import { createOutboxServices } from "../../foundation/outbox/index.js";
import { ParamsRepository, ParamsService } from "../params/index.js";
import { SubscriptionRepository } from "./subscription.repository.js";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service.js";

export { SubscriptionRepository } from "./subscription.repository.js";
export { SubscriptionLifecycleService } from "./subscription-lifecycle.service.js";
export { SubscriptionStateService } from "./subscription-state.service.js";
export {
  SchoolAppsController,
  SubscriptionsController,
} from "./subscriptions.controller.js";
export { SubscriptionsService } from "./subscriptions.service.js";
/** 非HTTP worker只装配生命周期服务，不加载当前身份或HTTP应用。 */
export function createSubscriptionLifecycle(sources: DataSourceRegistry) {
  const db: NodePgDatabase = sources.get().db;
  return new SubscriptionLifecycleService(
    new SubscriptionRepository(db),
    new NumbersService(new NumbersRepository(db)),
    new ParamsService(new ParamsRepository(db)),
    createOutboxServices(sources).writer,
  );
}

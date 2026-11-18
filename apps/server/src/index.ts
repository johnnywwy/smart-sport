/** worker仅通过此入口复用学校开通基础设施，不启动HTTP应用。 */
export { DataSourceRegistry } from "./database/registry.js";
export { TenantMigrator, TenantRepository } from "./infra/tenant/index.js";
export { ProvisionRepository } from "./infra/tenant/provision.repository.js";
export {
  provisionJobSchema,
  provisionQueue,
} from "./infra/tenant/provision-job.js";

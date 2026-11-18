import { loadDatabaseConfig } from "@smart-sport/config/env";
import { TenantMigrator, TenantRepository } from "../infra/tenant/index.js";
import { MigrationError, migratePublic } from "./migrate.js";
import { migrateOutbox } from "./migrate-outbox.js";
import { DataSourceRegistry } from "./registry.js";

async function main() {
  const registry = new DataSourceRegistry(loadDatabaseConfig());
  try {
    const applied = await migratePublic(registry.get().pool);
    console.log(
      applied.length
        ? `已执行 public 迁移：${applied.join(", ")}`
        : "public 迁移已是最新",
    );
    for (const key of registry.keys()) {
      const files = await migrateOutbox(registry.get(key).pool);
      console.log(`投递基础设施${key}：新增${files.length}个迁移`);
    }
    const migrator = new TenantMigrator(
      registry,
      new TenantRepository(registry.get().db),
    );
    const schools = await migrator.migrateAll();
    const failures = schools.filter((school) => school.status === "failed");
    console.log(`学校迁移：共${schools.length}所，失败${failures.length}所`);
    for (const failure of failures) {
      console.error(
        `学校${failure.schoolId}：${failure.error}；失败状态${failure.failureRecorded ? "已记录" : "未记录"}`,
      );
    }
    if (failures.length) process.exitCode = 1;
  } finally {
    await registry.onApplicationShutdown();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof MigrationError
      ? error.message
      : "数据库迁移失败，请检查数据库连接、配置及权限",
  );
  process.exitCode = 1;
}

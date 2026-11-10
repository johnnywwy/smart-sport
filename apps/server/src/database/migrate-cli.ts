import { loadDatabaseConfig } from "@smart-sport/config/env";
import { MigrationError, migratePublic } from "./migrate.js";
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
      : "public 迁移失败，请检查数据库连接、配置及权限",
  );
  process.exitCode = 1;
}

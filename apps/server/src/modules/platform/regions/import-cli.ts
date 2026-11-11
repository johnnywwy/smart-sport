import { resolve } from "node:path";
import { loadDatabaseConfig } from "@smart-sport/config/env";
import { DataSourceRegistry } from "../../../database/registry.js";
import { importRegions } from "./region-importer.js";

const file = resolve(process.argv[2] ?? "../../deploy/seed/regions.csv");
const registry = new DataSourceRegistry(loadDatabaseConfig());
try {
  const count = await importRegions(registry.get().pool, file);
  console.log(`区划导入完成：${count} 条`);
} catch {
  console.error("区划导入失败，请检查 CSV、数据库迁移和连接配置");
  process.exitCode = 1;
} finally {
  await registry.onApplicationShutdown();
}

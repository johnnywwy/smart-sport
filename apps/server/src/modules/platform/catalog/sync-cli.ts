import { loadDatabaseConfig } from "@smart-sport/config/env";
import { DataSourceRegistry } from "../../../database/registry.js";
import { syncCatalog } from "./catalog-sync.js";

const registry = new DataSourceRegistry(loadDatabaseConfig());
try {
  const counts = await syncCatalog(registry.get().pool);
  console.log(
    `应用目录同步完成：应用 ${counts.apps}，功能 ${counts.features}，菜单 ${counts.menus}，内置角色 ${counts.roles}，授权 ${counts.grants}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "应用目录同步失败");
  process.exitCode = 1;
} finally {
  await registry.onApplicationShutdown();
}

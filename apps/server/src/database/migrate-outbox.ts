import type pg from "pg";
import { MigrationError, readMigrations } from "./migration-files.js";
export const outboxMigrationDirectory = new URL(
  "../../migrations/outbox/",
  import.meta.url,
);

/** 每数据源独立迁移，不在独立学校库安装平台业务表。 */
export async function migrateOutbox(
  pool: pg.Pool,
  directory = outboxMigrationDirectory,
) {
  const files = await readMigrations(directory);
  const client = await pool.connect();
  let failed = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1936749167,12)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS public._outbox_migrations(version integer PRIMARY KEY,filename text NOT NULL,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const history = await client.query<{
      version: number;
      filename: string;
      checksum: string;
    }>(
      "SELECT version,filename,checksum FROM public._outbox_migrations ORDER BY version",
    );
    for (const [i, row] of history.rows.entries()) {
      const file = files[i];
      if (
        !file ||
        file.version !== row.version ||
        file.name !== row.filename ||
        file.checksum !== row.checksum
      )
        throw new MigrationError("投递迁移历史与文件不匹配");
    }
    const applied: string[] = [];
    for (const file of files.slice(history.rows.length)) {
      const query = { text: file.sql, queryMode: "extended" };
      await client.query(query);
      await client.query(
        "INSERT INTO public._outbox_migrations(version,filename,checksum) VALUES($1,$2,$3)",
        [file.version, file.name, file.checksum],
      );
      applied.push(file.name);
    }
    await client.query("COMMIT");
    return applied;
  } catch {
    failed = true;
    try {
      await client.query("ROLLBACK");
    } catch {
      /* 丢弃故障连接，不泄露原始异常。 */
    }
    throw new MigrationError("投递基础设施迁移失败，请检查数据源及迁移历史");
  } finally {
    client.release(failed);
  }
}

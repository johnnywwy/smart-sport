import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type pg from "pg";

export class MigrationError extends Error {}

export const publicMigrationDirectory = new URL(
  "../../migrations/public/",
  import.meta.url,
);

async function readMigrations(directory: URL) {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const versions = new Set<number>();
  return Promise.all(
    names.map(async (name) => {
      const match = /^(\d{4})_[\p{L}\p{N}_-]+\.sql$/u.exec(name);
      const version = Number(match?.[1]);
      if (!match || !version || versions.has(version)) {
        throw new MigrationError(`迁移文件名或版本无效：${name}`);
      }
      versions.add(version);
      const sql = await readFile(new URL(name, directory), "utf8");
      if (!sql.trim()) throw new MigrationError(`迁移文件为空：${name}`);
      return {
        name,
        version,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

export async function migratePublic(
  pool: pg.Pool,
  directory = publicMigrationDirectory,
) {
  const migrations = await readMigrations(directory);
  const client = await pool.connect();
  let failed = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    // 数据库内固定锁。事务结束时自动释放，包括回滚。
    await client.query("SELECT pg_advisory_xact_lock(1936749167, 11)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public._migrations (
        version integer PRIMARY KEY,
        filename text NOT NULL,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const history = await client.query<{
      version: number;
      filename: string;
      checksum: string;
    }>(
      "SELECT version, filename, checksum FROM public._migrations ORDER BY version",
    );
    for (const [index, row] of history.rows.entries()) {
      const file = migrations[index];
      if (
        !file ||
        file.version !== row.version ||
        file.name !== row.filename ||
        file.checksum !== row.checksum
      ) {
        throw new MigrationError(`迁移历史与文件不匹配，版本：${row.version}`);
      }
    }
    const applied: string[] = [];
    for (const file of migrations.slice(history.rowCount ?? 0)) {
      try {
        // SQL 来自仓库内版本化文件。扩展协议拒绝多语句，见迁移约定。
        const query = { text: file.sql, queryMode: "extended" };
        await client.query(query);
        await client.query(
          "INSERT INTO public._migrations (version, filename, checksum) VALUES ($1, $2, $3)",
          [file.version, file.name, file.checksum],
        );
      } catch (cause) {
        throw new MigrationError(`迁移失败：${file.name}`, { cause });
      }
      applied.push(file.name);
    }
    await client.query("COMMIT");
    return applied;
  } catch (error) {
    failed = true;
    try {
      await client.query("ROLLBACK");
    } catch {
      // 保留原始错误。连接会被丢弃。
    }
    throw error;
  } finally {
    client.release(failed);
  }
}

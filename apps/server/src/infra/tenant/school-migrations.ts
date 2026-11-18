import type pg from "pg";
import {
  MigrationError,
  readMigrations,
} from "../../database/migration-files.js";
import { assertSchoolSchemaName, schoolSchemaName } from "./schema-name.js";

export const schoolMigrationDirectory = new URL(
  "../../../migrations/school/",
  import.meta.url,
);
export type SchoolMigrations = Awaited<ReturnType<typeof readMigrations>>;

export function schoolMigrationSql(sql: string, schemaName: string) {
  assertSchoolSchemaName(schemaName);
  return sql.replaceAll("__SCHEMA__", `"${schemaName}"`);
}

/**
 * 在调用方的事务内迁移，不建schema、不提交；供增量迁移和T-062开通复用。
 * 只能传学校UUID，不能借用其他学校的schema。
 */
export async function applySchoolMigrations(
  client: pg.PoolClient,
  schoolId: string,
  files: SchoolMigrations,
) {
  const schema = schoolSchemaName(schoolId);
  // 校内事务锁也保护后续开通程序；散列碰撞至多额外串行，不会串库。
  await client.query("SELECT pg_advisory_xact_lock(1936749167, hashtext($1))", [
    schema,
  ]);
  const exists = await client.query(
    "SELECT 1 FROM pg_namespace WHERE nspname=$1",
    [schema],
  );
  if (!exists.rowCount) throw new MigrationError("学校库尚未创建，请重试开通");
  const table = `"${schema}"._migrations`;
  await client.query(`CREATE TABLE IF NOT EXISTS ${table} (
    version integer PRIMARY KEY, filename text NOT NULL,
    checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const history = await client.query<{
    version: number;
    filename: string;
    checksum: string;
  }>(`SELECT version,filename,checksum FROM ${table} ORDER BY version`);
  for (const [index, row] of history.rows.entries()) {
    const file = files[index];
    if (
      !file ||
      file.version !== row.version ||
      file.name !== row.filename ||
      file.checksum !== row.checksum
    ) {
      throw new MigrationError(`学校迁移历史不匹配，版本：${row.version}`);
    }
  }
  const applied: string[] = [];
  for (const file of files.slice(history.rows.length)) {
    try {
      const query = {
        text: schoolMigrationSql(file.sql, schema),
        queryMode: "extended",
      };
      await client.query(query);
      await client.query(
        `INSERT INTO ${table}(version,filename,checksum) VALUES($1,$2,$3)`,
        [file.version, file.name, file.checksum],
      );
    } catch {
      // 不透出数据库原始错误、SQL或连接信息。
      throw new MigrationError(`学校迁移失败，版本：${file.version}`);
    }
    applied.push(file.name);
  }
  return { applied, schemaVersion: files.at(-1)?.version ?? 0 };
}

export { readMigrations as readSchoolMigrations };

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

export class MigrationError extends Error {}

export async function readMigrations(directory: URL) {
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

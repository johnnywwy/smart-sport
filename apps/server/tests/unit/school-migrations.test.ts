import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { v7 } from "uuid";
import { afterAll, expect, it } from "vitest";
import { DataSourceRegistry } from "../../src/database/registry.js";
import {
  schoolSchemaName,
  TenantMigrator,
  TenantRepository,
} from "../../src/infra/tenant/index.js";
import {
  readSchoolMigrations,
  schoolMigrationSql,
} from "../../src/infra/tenant/school-migrations.js";

const directories: string[] = [];
afterAll(async () => {
  await Promise.all(
    directories.map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture(files: Record<string, string>) {
  const path = await mkdtemp(`${tmpdir()}/school-migration-files-`);
  directories.push(path);
  await Promise.all(
    Object.entries(files).map(([name, sql]) =>
      writeFile(`${path}/${name}`, sql),
    ),
  );
  return pathToFileURL(`${path}/`);
}

it("占位符替换为校验后的标识符，重复占位全部替换且拒绝注入与尾随换行", () => {
  const name = schoolSchemaName(v7());
  expect(schoolMigrationSql("__SCHEMA__.one __SCHEMA__.two", name)).toBe(
    `"${name}".one "${name}".two`,
  );
  for (const input of [
    "public",
    `${name}\n`,
    `${name}; DROP SCHEMA public`,
    name.toUpperCase(),
  ]) {
    expect(() => schoolMigrationSql("__SCHEMA__.probe", input)).toThrow(
      "学校库名称无效",
    );
  }
});

it("读取迁移独立排序、原文件SHA256，不把schema替换结果用作checksum", async () => {
  const dir = await fixture({
    "0002_second.sql": "SELECT 2",
    "0001_first.sql": "SELECT 1",
    "README.md": "忽略",
  });
  const files = await readSchoolMigrations(dir);
  expect(files.map((file) => file.version)).toEqual([1, 2]);
  expect(files[0]?.checksum).toBe(
    "e004ebd5b5532a4b85984a62f8ad48a81aa3460c1ca07701f386135d72cdecf5",
  );
});

it("空文件、零版本、重复版本、坏文件名均在迁移前拒绝", async () => {
  for (const files of [
    { "0001_empty.sql": " " },
    { "0000_zero.sql": "SELECT 1" },
    { "0001_a.sql": "SELECT 1", "0001_b.sql": "SELECT 2" },
    { "1_bad.sql": "SELECT 1" },
  ]) {
    await expect(readSchoolMigrations(await fixture(files))).rejects.toThrow();
  }
});

it("批量大小和单校UUID在连接数据库之前拒绝无效值", async () => {
  const sources = new DataSourceRegistry({
    DATABASE_URL: "postgres://test:test@127.0.0.1:1/test",
    EXTRA_DATASOURCES: {},
  });
  const migrator = new TenantMigrator(
    sources,
    new TenantRepository(sources.get().db),
  );
  for (const batchSize of [0, -1, 11, 1.5, Number.NaN]) {
    await expect(migrator.migrateAll({ batchSize })).rejects.toThrow(
      "每批数量",
    );
  }
  for (const id of ["", "public", "bad'; DROP SCHEMA public"]) {
    await expect(migrator.migrateSchool(id)).rejects.toMatchObject({
      code: 90004,
    });
  }
  await sources.onApplicationShutdown();
});

import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { v7 } from "uuid";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { DataSourceRegistry } from "../../src/database/registry.js";
import {
  createSchoolTables,
  schoolSchemaName,
  TenantRepository,
  TenantService,
} from "../../src/infra/tenant/index.js";
import type { schoolTenants } from "../../src/schema/public.js";

const sources = new DataSourceRegistry({
  DATABASE_URL: "postgres://test:test@127.0.0.1:1/test",
  EXTRA_DATASOURCES: {},
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => sources.onApplicationShutdown());

function fixture() {
  const schoolId = v7();
  const repository = new TenantRepository(sources.get().db);
  const tenant: typeof schoolTenants.$inferSelect = {
    schoolId,
    schemaName: schoolSchemaName(schoolId),
    datasource: "default",
    schemaVersion: 0,
    status: "active",
    lastError: null,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
  };
  vi.spyOn(repository, "revision").mockResolvedValue("1");
  vi.spyOn(repository, "snapshot").mockResolvedValue({ tenant, revision: "1" });
  return {
    tenant,
    repository,
    service: new TenantService(repository, sources),
  };
}

it("schema名仅由学校UUID生成，表名固定且携带显式schema", () => {
  const id = v7();
  const name = schoolSchemaName(id);
  expect(name).toMatch(/^school_[0-9a-f]{32}$/);
  expect(schoolSchemaName(id.toUpperCase())).toBe(name);
  const t = createSchoolTables(name);
  expect(getTableName(t.migrations)).toBe("_migrations");
  expect(getTableConfig(t.migrations).schema).toBe(name);
  for (const input of [
    "public",
    `${name};drop schema public`,
    name.toUpperCase(),
    `x${name}`,
    `${name}\n`,
  ]) {
    expect(() => createSchoolTables(input)).toThrow("学校库名称无效");
  }
  expect(() => schoolSchemaName("untrusted")).toThrow("学校标识无效");
});

it("无效学校标识不访问数据库，不存在或非active状态统一404", async () => {
  const { service, repository, tenant } = fixture();
  for (const value of ["", "bad", "bad' OR 1=1"]) {
    await expect(service.forSchool(value)).rejects.toMatchObject({
      code: 90004,
    });
  }
  expect(repository.revision).not.toHaveBeenCalled();
  vi.mocked(repository.snapshot).mockResolvedValueOnce(undefined);
  await expect(service.forSchool(v7())).rejects.toMatchObject({ code: 90004 });
  for (const status of [
    "provisioning",
    "failed",
    "suspended",
    "archived",
    "destroyed",
  ] as const) {
    vi.mocked(repository.snapshot).mockResolvedValueOnce({
      revision: "1",
      tenant: { ...tenant, status },
    });
    await expect(service.forSchool(tenant.schoolId)).rejects.toMatchObject({
      code: 90004,
    });
  }
});

it("即使登记损坏，也拒绝注入名称或属于其他学校的合法schema名", async () => {
  const { service, repository, tenant } = fixture();
  const get = vi.spyOn(sources, "get");
  for (const schemaName of [
    "public",
    "school_bad';drop schema public",
    schoolSchemaName(v7()),
  ]) {
    vi.mocked(repository.snapshot).mockResolvedValueOnce({
      revision: "1",
      tenant: { ...tenant, schemaName },
    });
    await expect(service.forSchool(tenant.schoolId)).rejects.toMatchObject({
      code: 90004,
    });
  }
  expect(get).not.toHaveBeenCalled();
});

it("并发首次访问共享同一组表对象，版本变化重新读取登记并清理缓存", async () => {
  const { service, repository, tenant } = fixture();
  const contexts = await Promise.all(
    Array.from({ length: 20 }, () => service.forSchool(tenant.schoolId)),
  );
  expect(contexts.every((value) => value === contexts[0])).toBe(true);
  const calls = vi.mocked(repository.snapshot).mock.calls.length;
  expect(await service.forSchool(tenant.schoolId)).toBe(contexts[0]);
  expect(repository.snapshot).toHaveBeenCalledTimes(calls);
  vi.mocked(repository.revision).mockResolvedValue("2");
  vi.mocked(repository.snapshot).mockResolvedValue({
    revision: "2",
    tenant: { ...tenant, status: "failed" },
  });
  await expect(service.forSchool(tenant.schoolId)).rejects.toMatchObject({
    code: 90004,
  });
  vi.mocked(repository.revision).mockResolvedValue("3");
  vi.mocked(repository.snapshot).mockResolvedValue({ revision: "3", tenant });
  expect(await service.forSchool(tenant.schoolId)).not.toBe(contexts[0]);
});

it("变更中的登记使用同一快照版本，不把旧状态缓存到新版本", async () => {
  const { service, repository, tenant } = fixture();
  vi.mocked(repository.snapshot).mockResolvedValueOnce({
    revision: "2",
    tenant,
  });
  const first = await service.forSchool(tenant.schoolId);
  vi.mocked(repository.revision).mockResolvedValue("2");
  expect(await service.forSchool(tenant.schoolId)).toBe(first);
  expect(repository.snapshot).toHaveBeenCalledTimes(1);
});

it("未知数据源拒绝使用默认池兜底，异常后也不缓存失败结果", async () => {
  const { service, repository, tenant } = fixture();
  vi.mocked(repository.snapshot).mockResolvedValue({
    revision: "1",
    tenant: { ...tenant, datasource: "missing" },
  });
  await expect(service.forSchool(tenant.schoolId)).rejects.toThrow(
    "未配置的数据源",
  );
  vi.mocked(repository.snapshot).mockResolvedValue({ revision: "1", tenant });
  expect((await service.forSchool(tenant.schoolId)).db).toBe(sources.get().db);
  service.onApplicationShutdown();
});

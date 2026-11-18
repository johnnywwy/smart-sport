import { loadProvisionCommandConfig } from "@smart-sport/config/env";
import { v7 } from "uuid";
import { expect, it } from "vitest";
import { provisionJobSchema } from "../../src/infra/tenant/provision-job.js";

it("队列只接收学校UUID和数据源key，拒绝schema、目录及连接串注入", () => {
  const schoolId = v7();
  expect(provisionJobSchema.parse({ schoolId })).toEqual({ schoolId });
  expect(provisionJobSchema.parse({ schoolId, datasource: "ds_hz" })).toEqual({
    schoolId,
    datasource: "ds_hz",
  });
  for (const data of [
    { schoolId: "bad" },
    { schoolId, schemaName: "public" },
    { schoolId, directory: "/tmp/evil" },
    { schoolId, datasource: "postgres://secret" },
    { schoolId, sql: "DROP SCHEMA public" },
  ])
    expect(provisionJobSchema.safeParse(data).success).toBe(false);
});

it("生产、未声明及未知环境开通命令配置均拒绝，仅开发/测试接受", () => {
  const env = {
    DATABASE_URL: "postgres://test:test@127.0.0.1/test",
    REDIS_URL: "redis://127.0.0.1:6379",
  };
  for (const NODE_ENV of [undefined, "", "production", "staging"]) {
    expect(() => loadProvisionCommandConfig({ ...env, NODE_ENV })).toThrow(
      "仅限开发、测试",
    );
  }
  for (const NODE_ENV of ["development", "test"]) {
    expect(loadProvisionCommandConfig({ ...env, NODE_ENV })).toMatchObject({
      NODE_ENV,
      WORKER_QUEUE_PREFIX: "smart-sport",
    });
  }
  expect(() =>
    loadProvisionCommandConfig({
      ...env,
      NODE_ENV: "test",
      EXTRA_DATASOURCES: "bad",
    }),
  ).toThrow();
});

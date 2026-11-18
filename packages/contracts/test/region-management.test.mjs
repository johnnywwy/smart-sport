import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmRegionSyncSchema,
  regionManagementQuerySchema,
} from "../dist/index.js";

test("区划管理分页父级排序严格校验，保留原选择接口", () => {
  assert.deepEqual(
    regionManagementQuerySchema.parse({ parent: "330000", pageSize: "10" }),
    { parent: "330000", page: 1, pageSize: 10, sort: "name:asc" },
  );
  for (const input of [
    { parent: "33" },
    { pageSize: 101 },
    { sort: "code:asc" },
    { extra: true },
  ])
    assert.equal(regionManagementQuerySchema.safeParse(input).success, false);
});
test("确认同步只接受预览指纹，不能提交任意文件或内容", () => {
  assert.deepEqual(
    confirmRegionSyncSchema.parse({ fingerprint: "a".repeat(64) }),
    { fingerprint: "a".repeat(64) },
  );
  for (const input of [
    { fingerprint: "x" },
    { fingerprint: "a".repeat(64), file: "/tmp/data.csv" },
  ])
    assert.equal(confirmRegionSyncSchema.safeParse(input).success, false);
});

test("区划管理空列表仍声明同步能力，不能伪造其他动作", async () => {
  const { regionManagementListSchema } = await import("../dist/index.js");
  const base = { items: [], total: 0, page: 1, pageSize: 20 };
  assert.equal(
    regionManagementListSchema.safeParse({
      ...base,
      allowedActions: ["import"],
    }).success,
    true,
  );
  assert.equal(
    regionManagementListSchema.safeParse({
      ...base,
      allowedActions: ["delete"],
    }).success,
    false,
  );
  assert.equal(regionManagementListSchema.safeParse(base).success, false);
});

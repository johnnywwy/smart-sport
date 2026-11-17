import assert from "node:assert/strict";
import test from "node:test";
import {
  systemParamDefinitions,
  systemParamListSchema,
  systemParamQuerySchema,
  systemParamValueSchema,
  updateSystemParamSchema,
} from "../dist/index.js";
import { systemParamExample } from "../dist/param-examples.js";

test("八个参数的默认值、上下界及类型严格校验", () => {
  assert.equal(new Set(systemParamDefinitions.map((d) => d.key)).size, 8);
  for (const d of systemParamDefinitions) {
    const schema = systemParamValueSchema(d.key);
    for (const value of [d.min, d.max, d.defaultValue])
      assert.ok(schema.safeParse(value).success);
    for (const value of [d.min - 1, d.max + 1, 1.5, "8", null, true, {}, []])
      assert.equal(schema.safeParse(value).success, false);
  }
});
test("修改仅允许值、版本及必填原因，不能改目录和校验规则", () => {
  const input = { value: 8, version: 0, reason: "调整密码策略" };
  assert.deepEqual(updateSystemParamSchema.parse(input), input);
  for (const extra of [
    { reason: "  " },
    { reason: undefined },
    { version: undefined },
    { version: -1 },
    { value: "8" },
    { value: 1.5 },
    { value: 366 },
    { name: "密码" },
    { key: "other" },
    { valueSchema: {} },
    { deletedAt: null },
  ])
    assert.equal(
      updateSystemParamSchema.safeParse({ ...input, ...extra }).success,
      false,
    );
});
test("分页排序及响应遵守契约，零值仅用于允许关闭的参数", () => {
  assert.ok(
    systemParamListSchema.safeParse({
      items: [systemParamExample],
      total: 1,
      page: 1,
      pageSize: 20,
    }).success,
  );
  assert.equal(
    systemParamListSchema.safeParse({
      items: [{ ...systemParamExample, value: 0 }],
      total: 1,
      page: 1,
      pageSize: 20,
    }).success,
    false,
  );
  assert.ok(
    systemParamQuerySchema.safeParse({ page: "2", sort: "updatedAt:desc" })
      .success,
  );
  for (const query of [
    { pageSize: 101 },
    { sort: "key:asc" },
    { schoolId: "x" },
  ])
    assert.equal(systemParamQuerySchema.safeParse(query).success, false);
});

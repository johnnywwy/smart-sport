import assert from "node:assert/strict";
import test from "node:test";
import {
  apiErrors,
  numberDefinitions,
  numberRuleListSchema,
  numberRuleParamsSchema,
  numberRuleQuerySchema,
  updateNumberRuleSchema,
} from "../dist/index.js";
import { numberRuleExample } from "../dist/number-examples.js";

test("编号对象与默认前缀唯一，包含导入批次，列表示例符合契约", () => {
  assert.equal(new Set(numberDefinitions.map((d) => d.type)).size, 6);
  assert.equal(new Set(numberDefinitions.map((d) => d.prefix)).size, 6);
  assert.equal(numberDefinitions.find((d) => d.type === "import").prefix, "DR");
  assert.ok(numberRuleListSchema.safeParse([numberRuleExample]).success);
  assert.ok(
    numberRuleListSchema.safeParse([
      { ...numberRuleExample, nextNumber: null, allowedActions: [] },
    ]).success,
  );
});
test("修改只允许前缀、位数、周期及版本，禁止回拨流水或指定年份和对象", () => {
  const valid = { version: 0, prefix: "ZX", digits: 6, reset: "yearly" };
  assert.deepEqual(updateNumberRuleSchema.parse(valid), valid);
  for (const input of [
    { ...valid, version: undefined },
    { ...valid, version: -1 },
    { ...valid, digits: 0 },
    { ...valid, digits: 13 },
    { ...valid, digits: 1.5 },
    { ...valid, digits: "6" },
    { ...valid, prefix: "zx" },
    { ...valid, prefix: "ZX-2026" },
    { ...valid, prefix: "1ZX" },
    { ...valid, prefix: "ABCDEFGHIJKLMNOP" },
    { ...valid, reset: "monthly" },
    ...["type", "year", "currentValue", "deletedAt"].map((key) => ({
      ...valid,
      [key]: 0,
    })),
  ])
    assert.equal(updateNumberRuleSchema.safeParse(input).success, false);
  assert.ok(
    updateNumberRuleSchema.safeParse({ ...valid, reset: "never" }).success,
  );
});
test("路由和查询严格校验，不接受未知学校范围或任意取号参数", () => {
  assert.ok(
    numberRuleParamsSchema.safeParse({ id: numberRuleExample.id }).success,
  );
  assert.equal(numberRuleParamsSchema.safeParse({ id: "task" }).success, false);
  assert.ok(numberRuleQuerySchema.safeParse({}).success);
  assert.equal(
    numberRuleQuerySchema.safeParse({ schoolId: "x" }).success,
    false,
  );
  for (const code of [30001, 30002, 30003]) assert.ok(apiErrors[code]);
});

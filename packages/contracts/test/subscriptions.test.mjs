import assert from "node:assert/strict";
import test from "node:test";
import {
  apiErrors,
  schoolAppsSchema,
  subscriptionExamples,
  subscriptionParamsSchema,
  subscriptionQuerySchema,
} from "../dist/index.js";

test("服务查询严格校验分页、状态与到期天数", () => {
  assert.deepEqual(subscriptionQuerySchema.parse({}), {
    page: 1,
    pageSize: 20,
  });
  assert.equal(
    subscriptionQuerySchema.parse({ expiringInDays: "0" }).expiringInDays,
    0,
  );
  for (const input of [
    { page: "0" },
    { status: "pending" },
    { expiringInDays: "-1" },
    { expiringInDays: "3651" },
    { sort: "secret" },
  ])
    assert.equal(subscriptionQuerySchema.safeParse(input).success, false);
});
test("学校应用示例与参数符合共享契约", () => {
  assert.equal(
    schoolAppsSchema.parse(subscriptionExamples.apps).accessMode,
    "readonly",
  );
  assert.equal(
    subscriptionParamsSchema.safeParse({ schoolId: "bad" }).success,
    false,
  );
  for (const code of [13001, 13002, 13003, 13004])
    assert.equal(apiErrors[code].status, 403);
});

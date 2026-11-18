import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelTaskSchema,
  taskListQuerySchema,
  taskListSchema,
  taskSchema,
} from "../dist/index.js";
import { cancellingTaskExample, taskExample } from "../dist/task-examples.js";

test("任务列表仅接受本人身份查询，明确筛选与分页上限", () => {
  assert.deepEqual(taskListQuerySchema.parse({}), {
    page: 1,
    pageSize: 20,
    mine: true,
  });
  for (const input of [
    { mine: false },
    { mine: "false" },
    { identityId: taskExample.id },
    { pageSize: 101 },
    { status: "cancelling" },
  ])
    assert.equal(taskListQuerySchema.safeParse(input).success, false);
  assert.ok(
    taskListQuerySchema.safeParse({ mine: "true", status: "active", page: "2" })
      .success,
  );
});
test("取消需要版本，不能从客户端改状态、归属或进度", () => {
  assert.ok(cancelTaskSchema.safeParse({ version: 0 }).success);
  for (const input of [
    {},
    { version: -1 },
    { version: 0, status: "cancelled" },
  ])
    assert.equal(cancelTaskSchema.safeParse(input).success, false);
});
test("任务和取消中示例均可解析，列表含独立进行中计数且不泄露内部载荷", () => {
  for (const example of [taskExample, cancellingTaskExample])
    assert.ok(taskSchema.safeParse(example).success);
  assert.ok(
    taskListSchema.safeParse({
      items: [taskExample],
      total: 1,
      page: 1,
      pageSize: 20,
      activeCount: 1,
    }).success,
  );
  for (const patch of [
    { progress: 101 },
    { allowedActions: ["retry"] },
    { payload: { secret: "x" } },
    { error: "SQL secret" },
    { summary: { phone: "x" } },
  ])
    assert.equal(
      taskSchema.safeParse({ ...taskExample, ...patch }).success,
      false,
    );
});

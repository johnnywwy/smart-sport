import assert from "node:assert/strict";
import { test } from "node:test";
import {
  outboxEventInputSchema,
  outboxReferenceSchema,
} from "../dist/index.js";

const id = "0193a000-0000-7000-8000-000000000001";
test("四类主题只接受记录引用，学校事件必须指定学校", () => {
  for (const topic of [
    "school.student.created",
    "school.student.status_changed",
    "subscription.changed",
    "scope.changed",
  ]) {
    const event = {
      topic,
      schoolId: id,
      payload: { recordId: id, version: 0 },
    };
    assert.equal(outboxEventInputSchema.safeParse(event).success, true);
    assert.equal(
      outboxEventInputSchema.safeParse({
        ...event,
        payload: { ...event.payload, phone: "private" },
      }).success,
      false,
    );
  }
  assert.equal(
    outboxEventInputSchema.safeParse({
      topic: "school.student.created",
      schoolId: null,
      payload: { recordId: id, version: 0 },
    }).success,
    false,
  );
  assert.equal(
    outboxEventInputSchema.safeParse({
      topic: "unknown",
      schoolId: null,
      payload: { recordId: id, version: 0 },
    }).success,
    false,
  );
});
test("队列引用拒绝任意数据源地址、额外载荷及非法ID", () => {
  assert.equal(
    outboxReferenceSchema.safeParse({ datasource: "ds_school", eventId: id })
      .success,
    true,
  );
  for (const input of [
    { datasource: "postgres://private", eventId: id },
    { datasource: "default", eventId: "bad" },
    { datasource: "default", eventId: id, payload: {} },
  ])
    assert.equal(outboxReferenceSchema.safeParse(input).success, false);
});

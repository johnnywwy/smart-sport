import assert from "node:assert/strict";
import test from "node:test";
import {
  academicYearOptionsExamples,
  academicYearOptionsSchema,
} from "../dist/index.js";

test("空日历独立声明新建能力，只读无操作，不接受伪造的其他写能力", () => {
  assert.deepEqual(academicYearOptionsExamples.editable, {
    allowedActions: ["create"],
  });
  assert.deepEqual(academicYearOptionsExamples.readOnly, {
    allowedActions: [],
  });
  assert.equal(
    academicYearOptionsSchema.safeParse({ allowedActions: ["delete"] }).success,
    false,
  );
});

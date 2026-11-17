import assert from "node:assert/strict";
import test from "node:test";
import {
  academicYearExample,
  currentAcademicExample,
} from "../dist/academic-examples.js";
import {
  academicYearListSchema,
  apiErrors,
  createAcademicYearSchema,
  currentAcademicSchema,
  setCurrentSemesterSchema,
  updateSemesterSchema,
} from "../dist/index.js";

test("学年与当前学期示例、未初始化空值符合契约", () => {
  assert.ok(academicYearListSchema.safeParse([academicYearExample]).success);
  assert.ok(currentAcademicSchema.safeParse(currentAcademicExample).success);
  assert.ok(
    currentAcademicSchema.safeParse({ academicYear: null, semester: null })
      .success,
  );
  assert.equal(apiErrors[20001].status, 409);
  assert.equal(apiErrors[20002].status, 409);
});
test("仅接受整数起始年，不允许客户端指定名称、状态和当前标记", () => {
  assert.ok(createAcademicYearSchema.safeParse({ startYear: 2026 }).success);
  for (const input of [
    { startYear: 0 },
    { startYear: 9999 },
    { startYear: 2026.5 },
    { startYear: "2026" },
    { startYear: 2026, isCurrent: true },
    { startYear: 2026, status: "current" },
    { startYear: 2026, name: "自定义学年" },
  ])
    assert.equal(createAcademicYearSchema.safeParse(input).success, false);
});
test("调整日期必须携带版本和真实日期，结束不早于开始", () => {
  const valid = {
    version: 0,
    startDate: "2028-02-29",
    endDate: "2028-07-31",
  };
  assert.ok(updateSemesterSchema.safeParse(valid).success);
  for (const input of [
    { ...valid, version: undefined },
    { ...valid, version: -1 },
    { ...valid, startDate: "2027-02-29" },
    { ...valid, endDate: "2028-02-28" },
    { ...valid, startDate: "2028-02-29T00:00:00Z" },
    { ...valid, isCurrent: true },
  ])
    assert.equal(updateSemesterSchema.safeParse(input).success, false);
  assert.ok(setCurrentSemesterSchema.safeParse({ version: 0 }).success);
  assert.equal(setCurrentSemesterSchema.safeParse({}).success, false);
  assert.equal(
    setCurrentSemesterSchema.safeParse({ version: 0, academicYearId: "x" })
      .success,
    false,
  );
});

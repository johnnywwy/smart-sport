import assert from "node:assert/strict";
import test from "node:test";
import {
  apiErrors,
  createSchoolProfileSchema,
  schoolProfileSchema,
  schoolStageConfigurationSchema,
  updateSchoolProfileSchema,
} from "../dist/index.js";
import {
  createSchoolProfileExample,
  schoolProfileExample,
} from "../dist/school-profile-examples.js";

test("档案示例与版本契约，手机号省略保留、null清空", () => {
  assert.ok(schoolProfileSchema.safeParse(schoolProfileExample).success);
  const { contactPhone, ...input } = createSchoolProfileExample;
  assert.equal(
    updateSchoolProfileSchema.parse({ ...input, version: 0 }).contactPhone,
    undefined,
  );
  assert.equal(
    updateSchoolProfileSchema.parse({
      ...input,
      version: 0,
      contactPhone: null,
    }).contactPhone,
    null,
  );
  for (const extra of [
    { schoolId: schoolProfileExample.schoolId },
    { schoolName: "越权改名" },
    { contactPhone: "138****5678" },
  ])
    assert.equal(
      updateSchoolProfileSchema.safeParse({ ...input, version: 0, ...extra })
        .success,
      false,
    );
  assert.equal(updateSchoolProfileSchema.safeParse(input).success, false);
});
test("标识码精确10位，联系电话支持手机号和固定电话", () => {
  for (const schoolCode of ["123456789", "12345678901", "A234567890"])
    assert.equal(
      createSchoolProfileSchema.safeParse({
        ...createSchoolProfileExample,
        schoolCode,
      }).success,
      false,
    );
  for (const contactPhone of [
    "13812345678",
    "0571-12345678",
    "+86 571 12345678",
  ])
    assert.ok(
      createSchoolProfileSchema.safeParse({
        ...createSchoolProfileExample,
        contactPhone,
      }).success,
    );
});
test("所有允许学制均有效，重复学段、漏项、多项和非法年限被拒绝", () => {
  for (const [stage, years] of [
    [1, [5, 6]],
    [2, [3, 4]],
    [3, [3]],
    [4, [3, 4, 5]],
  ])
    for (const year of years)
      assert.ok(
        schoolStageConfigurationSchema.safeParse({
          stages: [stage],
          stageYears: { [stage]: year },
        }).success,
      );
  for (const config of [
    { stages: [], stageYears: {} },
    { stages: [1, 1], stageYears: { 1: 6 } },
    { stages: [1, 2], stageYears: { 1: 6 } },
    { stages: [1], stageYears: { 1: 6, 2: 3 } },
    { stages: [1], stageYears: { 1: 4 } },
    { stages: [2], stageYears: { 2: 5 } },
    { stages: [3], stageYears: { 3: 4 } },
    { stages: [4], stageYears: { 4: 6 } },
  ])
    assert.equal(
      schoolStageConfigurationSchema.safeParse(config).success,
      false,
    );
  assert.equal(apiErrors[12005].status, 409);
  assert.equal(apiErrors[12006].status, 422);
});

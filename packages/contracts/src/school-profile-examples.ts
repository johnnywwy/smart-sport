import {
  createSchoolProfileSchema,
  schoolProfileSchema,
} from "./school-profiles.js";

export const createSchoolProfileExample = createSchoolProfileSchema.parse({
  schoolCode: "1234567890",
  stages: [1, 2],
  stageYears: { "1": 6, "2": 3 },
  nature: "公办",
  address: "示例市示例路1号",
  contactName: "学校联系人",
  contactPhone: null,
});
export const schoolProfileExample = schoolProfileSchema.parse({
  ...createSchoolProfileExample,
  schoolId: "019c1472-9e57-7000-8000-000000000001",
  schoolName: "示例九年一贯制学校",
  contactPhone: "138****5678",
  version: 0,
  allowedActions: ["update"],
});

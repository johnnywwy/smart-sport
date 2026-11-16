import { z } from "zod";
import { idSchema, versionSchema } from "./common.js";

export const schoolStageSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export const schoolStageYearsSchema = z.strictObject({
  "1": z.union([z.literal(5), z.literal(6)]).optional(),
  "2": z.union([z.literal(3), z.literal(4)]).optional(),
  "3": z.literal(3).optional(),
  "4": z.union([z.literal(3), z.literal(4), z.literal(5)]).optional(),
});
export const schoolStageConfigurationSchema = z
  .strictObject({
    stages: z.array(schoolStageSchema).min(1).max(4),
    stageYears: schoolStageYearsSchema,
  })
  .superRefine(({ stages, stageYears }, ctx) => {
    if (new Set(stages).size !== stages.length)
      ctx.addIssue({
        code: "custom",
        path: ["stages"],
        message: "学段不能重复",
      });
    const keys = Object.keys(stageYears);
    if (
      keys.length !== stages.length ||
      stages.some((stage) => !keys.includes(String(stage)))
    )
      ctx.addIssue({
        code: "custom",
        path: ["stageYears"],
        message: "各学段年限必须与所选学段一一对应",
      });
  });

const profileFields = {
  schoolCode: z.string().regex(/^\d{10}$/, "学校标识码必须为10位数字"),
  stages: z.array(schoolStageSchema).min(1).max(4),
  stageYears: schoolStageYearsSchema,
  nature: z.enum(["公办", "民办"]),
  address: z.string().trim().min(1).max(500).nullable(),
  contactName: z.string().trim().min(1).max(64).nullable(),
};
export const schoolProfileParamsSchema = z.strictObject({ schoolId: idSchema });
/** 输入只传新的联系电话；不能将响应中的脱敏值作为新号码回传。 */
export const schoolContactPhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[\d ()-]{5,32}$/, "请输入有效的联系电话")
  .refine((value) => (value.match(/\d/g)?.length ?? 0) >= 5, "联系电话过短");

/** 档案由学校开通流程创建，未提供公开的创建接口。 */
export const createSchoolProfileSchema = z
  .strictObject({
    ...profileFields,
    contactPhone: schoolContactPhoneSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    const result = schoolStageConfigurationSchema.safeParse({
      stages: value.stages,
      stageYears: value.stageYears,
    });
    if (!result.success)
      for (const issue of result.error.issues)
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
  });
export const updateSchoolProfileSchema = z
  .strictObject({
    ...profileFields,
    version: versionSchema,
    contactPhone: schoolContactPhoneSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const result = schoolStageConfigurationSchema.safeParse({
      stages: value.stages,
      stageYears: value.stageYears,
    });
    if (!result.success)
      for (const issue of result.error.issues)
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
  });
export const schoolProfileSchema = z.strictObject({
  ...profileFields,
  schoolId: idSchema,
  schoolName: z.string().min(1),
  contactPhone: z.string().nullable(),
  version: versionSchema,
  allowedActions: z.array(z.literal("update")),
});
export type CreateSchoolProfile = z.infer<typeof createSchoolProfileSchema>;
export type UpdateSchoolProfile = z.infer<typeof updateSchoolProfileSchema>;
export type SchoolProfile = z.infer<typeof schoolProfileSchema>;

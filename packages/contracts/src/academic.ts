import { z } from "zod";
import { dateSchema, idSchema, versionSchema } from "./common.js";

export const academicParamsSchema = z.strictObject({ id: idSchema });
export const academicEmptyQuerySchema = z.strictObject({});
export const createAcademicYearSchema = z.strictObject({
  startYear: z.int().min(1).max(9998),
});
export const updateSemesterSchema = z
  .strictObject({
    version: versionSchema,
    startDate: dateSchema,
    endDate: dateSchema,
  })
  .refine((value) => value.startDate <= value.endDate, {
    path: ["endDate"],
    message: "结束日期不能早于开始日期",
  });
export const setCurrentSemesterSchema = z.strictObject({
  version: versionSchema,
});
export const semesterSchema = z.strictObject({
  id: idSchema,
  academicYearId: idSchema,
  term: z.union([z.literal(1), z.literal(2)]),
  name: z.string().min(1),
  startDate: dateSchema,
  endDate: dateSchema,
  isCurrent: z.boolean(),
  version: versionSchema,
  allowedActions: z.array(z.enum(["update", "set-current"])),
});
export const academicYearSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  startDate: dateSchema,
  endDate: dateSchema,
  status: z.enum(["draft", "current", "closed"]),
  isCurrent: z.boolean(),
  version: versionSchema,
  semesters: z.tuple([semesterSchema, semesterSchema]),
});
export const academicYearListSchema = z.array(academicYearSchema);
/** 初始化前两项均为 null；读接口不会创建当前学年。 */
export const currentAcademicSchema = z.strictObject({
  academicYear: academicYearSchema.nullable(),
  semester: semesterSchema.nullable(),
});
export type CreateAcademicYear = z.infer<typeof createAcademicYearSchema>;
export type UpdateSemester = z.infer<typeof updateSemesterSchema>;
export type AcademicYear = z.infer<typeof academicYearSchema>;
export type Semester = z.infer<typeof semesterSchema>;

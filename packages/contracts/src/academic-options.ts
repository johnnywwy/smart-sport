import { z } from "zod";

/** 独立于学年列表，在尚无日历记录时也能准确控制全局新建入口。 */
export const academicYearOptionsSchema = z.strictObject({
  allowedActions: z.array(z.literal("create")),
});
export const academicYearOptionsExamples = {
  editable: academicYearOptionsSchema.parse({ allowedActions: ["create"] }),
  readOnly: academicYearOptionsSchema.parse({ allowedActions: [] }),
};

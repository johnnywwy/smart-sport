import { z } from "zod";

export const provisionQueue = "school-provision";
/** 内部队列载荷，不接受外部schema名、SQL目录或数据库连接串。 */
export const provisionJobSchema = z.strictObject({
  schoolId: z.uuid(),
  datasource: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .optional(),
});

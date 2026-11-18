import { z } from "zod";
import { idSchema } from "./common.js";

export const outboxTopicSchema = z.enum([
  "school.student.created",
  "school.student.status_changed",
  "subscription.changed",
  "scope.changed",
]);
export type OutboxTopic = z.infer<typeof outboxTopicSchema>;

/** 只传业务引用；禁止把凭据、证件或手机号快照写入事件。 */
export const outboxEventInputSchema = z
  .strictObject({
    topic: outboxTopicSchema,
    schoolId: idSchema.nullable(),
    payload: z.strictObject({
      recordId: idSchema,
      version: z.int().nonnegative(),
    }),
  })
  .superRefine((event, context) => {
    if (event.topic.startsWith("school.") && !event.schoolId) {
      context.addIssue({
        code: "custom",
        path: ["schoolId"],
        message: "学校事件必须指定学校",
      });
    }
  });
export type OutboxEventInput = z.infer<typeof outboxEventInputSchema>;

/** 队列不复制业务载荷；数据源仅接受服务器已配置的key。 */
export const outboxReferenceSchema = z.strictObject({
  datasource: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .max(64),
  eventId: idSchema,
});
export type OutboxReference = z.infer<typeof outboxReferenceSchema>;

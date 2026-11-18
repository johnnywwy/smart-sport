import { z } from "zod";
import {
  idSchema,
  paginatedSchema,
  paginationQuerySchema,
  timestampSchema,
  versionSchema,
} from "./common.js";

export const taskTypeSchema = z.enum([
  "import",
  "export",
  "provision",
  "rollover",
  "tenant_export",
]);
export const taskStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
  "cancelled",
]);
export const taskSummarySchema = z.strictObject({
  total: z.int().nonnegative().optional(),
  processed: z.int().nonnegative().optional(),
  succeeded: z.int().nonnegative().optional(),
  failed: z.int().nonnegative().optional(),
  skipped: z.int().nonnegative().optional(),
});
export const taskListQuerySchema = paginationQuerySchema
  .extend({
    mine: z.union([z.literal(true), z.literal("true")]).default(true),
    status: z.union([taskStatusSchema, z.literal("active")]).optional(),
  })
  .strict();
export const taskParamsSchema = z.strictObject({ id: idSchema });
export const cancelTaskSchema = z.strictObject({ version: versionSchema });
export const taskSchema = z.strictObject({
  id: idSchema,
  no: z.string().min(1),
  type: taskTypeSchema,
  schoolId: idSchema.nullable(),
  status: taskStatusSchema,
  progress: z.int().min(0).max(100),
  summary: taskSummarySchema,
  resultFileId: idSchema.nullable(),
  error: z.literal("任务执行失败，请重试或联系管理员").nullable(),
  cancelRequestedAt: timestampSchema.nullable(),
  startedAt: timestampSchema.nullable(),
  finishedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  version: versionSchema,
  allowedActions: z.array(z.literal("cancel")).max(1),
});
export const taskListSchema = paginatedSchema(taskSchema).extend({
  activeCount: z.int().nonnegative(),
});
export type TaskType = z.infer<typeof taskTypeSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskSummary = z.infer<typeof taskSummarySchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
export type CancelTask = z.infer<typeof cancelTaskSchema>;

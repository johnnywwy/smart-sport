import { taskSchema } from "@smart-sport/contracts";
import { canCancelTask, type TaskState } from "@smart-sport/domain";
import type { TaskRow } from "./tasks.repository.js";
export function taskState(row: TaskRow): TaskState {
  return {
    type: row.type,
    status: row.status,
    progress: row.progress,
    summary: row.summary,
    cancelRequested: row.cancelRequestedAt !== null,
  };
}
export function taskResponse(row: TaskRow) {
  return taskSchema.parse({
    id: row.id,
    no: row.no,
    type: row.type,
    schoolId: row.schoolId,
    status: row.status,
    progress: row.progress,
    summary: row.summary,
    resultFileId: row.resultFileId,
    error: row.error,
    cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
    allowedActions: canCancelTask(taskState(row)) ? ["cancel"] : [],
  });
}

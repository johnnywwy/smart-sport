import type { Task } from "./tasks.js";
export const taskExample: Task = {
  id: "019abc00-0000-7000-8000-000000000001",
  no: "RW-2026-000001",
  type: "import",
  schoolId: null,
  status: "running",
  progress: 40,
  summary: { total: 100, processed: 40, succeeded: 38, failed: 2 },
  resultFileId: null,
  error: null,
  cancelRequestedAt: null,
  startedAt: "2026-11-18T01:00:00.000Z",
  finishedAt: null,
  createdAt: "2026-11-18T00:59:59.000Z",
  updatedAt: "2026-11-18T01:00:01.000Z",
  version: 2,
  allowedActions: ["cancel"],
};
export const cancellingTaskExample: Task = {
  ...taskExample,
  cancelRequestedAt: "2026-11-18T01:00:02.000Z",
  version: 3,
  allowedActions: [],
};

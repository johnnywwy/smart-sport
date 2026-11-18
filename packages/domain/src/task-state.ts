import type { TaskStatus, TaskSummary, TaskType } from "@smart-sport/contracts";

export type TaskState = {
  type: TaskType;
  status: TaskStatus;
  progress: number;
  summary: TaskSummary;
  cancelRequested: boolean;
};
export type TaskCommand =
  | { action: "start" }
  | { action: "cancel" }
  | { action: "acknowledgeCancel" }
  | { action: "fail" }
  | { action: "progress"; progress: number; summary: TaskSummary }
  | { action: "finish"; status: "succeeded" | "partial"; summary: TaskSummary };
export function canCancelTask(task: TaskState) {
  return (
    !task.cancelRequested &&
    (task.status === "queued" ||
      (task.status === "running" && ["import", "export"].includes(task.type)))
  );
}
/** 终态不可重开；取消申请只能由执行程序在安全节点确认，不能被进度覆盖。 */
export function planTaskTransition(
  task: TaskState,
  command: TaskCommand,
): { error: 30020 | 30021 | 90001 } | { state: TaskState } {
  const state = { ...task };
  if (command.action === "cancel") {
    if (task.status === "running" && !["import", "export"].includes(task.type))
      return { error: 30021 };
    if (!canCancelTask(task)) return { error: 30020 };
    state.cancelRequested = true;
    if (task.status === "queued") state.status = "cancelled";
  } else if (command.action === "start") {
    if (task.status !== "queued" || task.cancelRequested)
      return { error: 30020 };
    state.status = "running";
  } else {
    if (task.status !== "running") return { error: 30020 };
    if (command.action === "acknowledgeCancel") {
      if (!task.cancelRequested) return { error: 30020 };
      state.status = "cancelled";
    } else if (command.action === "fail") {
      state.status = "failed";
    } else {
      if (command.action === "finish" && task.cancelRequested)
        return { error: 30020 };
      const summary = { ...task.summary, ...command.summary };
      for (const key of Object.keys(summary) as (keyof TaskSummary)[]) {
        const value = summary[key];
        if (
          value === undefined ||
          !Number.isSafeInteger(value) ||
          value < (task.summary[key] ?? 0)
        )
          return { error: 90001 };
      }
      if (
        (summary.total !== undefined &&
          (summary.processed ?? 0) > summary.total) ||
        (summary.processed !== undefined &&
          (summary.succeeded ?? 0) +
            (summary.failed ?? 0) +
            (summary.skipped ?? 0) >
            summary.processed)
      )
        return { error: 90001 };
      state.summary = summary;
      state.progress = command.action === "finish" ? 100 : command.progress;
      if (
        !Number.isInteger(state.progress) ||
        state.progress < task.progress ||
        state.progress > 100 ||
        (command.action === "progress" && state.progress === 100)
      )
        return { error: 90001 };
      if (command.action === "finish") state.status = command.status;
    }
  }
  return { state };
}

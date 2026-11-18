import { describe, expect, it } from "vitest";
import {
  canCancelTask,
  planTaskTransition,
  type TaskState,
} from "./task-state.js";

const running: TaskState = {
  type: "import",
  status: "running",
  progress: 25,
  summary: { total: 100, processed: 25, succeeded: 25 },
  cancelRequested: false,
};
describe("任务状态机", () => {
  it("排队可以取消；结构变更任务运行后禁止取消", () => {
    for (const type of [
      "import",
      "export",
      "provision",
      "rollover",
      "tenant_export",
    ] as const) {
      const queued = {
        ...running,
        type,
        status: "queued" as const,
        progress: 0,
      };
      expect(canCancelTask(queued)).toBe(true);
      expect(planTaskTransition(queued, { action: "cancel" })).toMatchObject({
        state: { status: "cancelled", cancelRequested: true },
      });
      expect(canCancelTask({ ...running, type })).toBe(
        ["import", "export"].includes(type),
      );
      if (!["import", "export"].includes(type))
        expect(
          planTaskTransition({ ...running, type }, { action: "cancel" }),
        ).toEqual({ error: 30021 });
    }
  });
  it("执行取消先申请，进度保留取消标记，安全节点确认才结束", () => {
    const cancelling = { ...running, cancelRequested: true };
    expect(planTaskTransition(running, { action: "cancel" })).toMatchObject({
      state: { status: "running", cancelRequested: true, progress: 25 },
    });
    expect(canCancelTask(cancelling)).toBe(false);
    expect(
      planTaskTransition(cancelling, {
        action: "progress",
        progress: 30,
        summary: { processed: 30 },
      }),
    ).toMatchObject({
      state: { cancelRequested: true, status: "running", progress: 30 },
    });
    expect(
      planTaskTransition(cancelling, {
        action: "finish",
        status: "succeeded",
        summary: {},
      }),
    ).toEqual({ error: 30020 });
    expect(
      planTaskTransition(cancelling, { action: "acknowledgeCancel" }),
    ).toMatchObject({
      state: { status: "cancelled", progress: 25, summary: running.summary },
    });
    expect(
      planTaskTransition(running, { action: "acknowledgeCancel" }),
    ).toEqual({ error: 30020 });
  });
  it("终态不能重开、上报进度或再次结束", () => {
    for (const status of [
      "succeeded",
      "partial",
      "failed",
      "cancelled",
    ] as const) {
      const task = { ...running, status };
      expect(canCancelTask(task)).toBe(false);
      for (const command of [
        { action: "start" },
        { action: "cancel" },
        { action: "fail" },
        { action: "acknowledgeCancel" },
        { action: "progress", progress: 25, summary: {} },
        { action: "finish", status: "succeeded", summary: {} },
      ] as const)
        expect(planTaskTransition(task, command)).toEqual({ error: 30020 });
    }
  });
  it("进度与计数单调增长，不接受越界、负数或不一致的计数", () => {
    for (const progress of [-1, 24, 100, 101, 25.5, Number.NaN])
      expect(
        planTaskTransition(running, {
          action: "progress",
          progress,
          summary: {},
        }),
      ).toEqual({ error: 90001 });
    for (const summary of [
      { processed: 24 },
      { total: 99 },
      { processed: 101 },
      { succeeded: 26 },
      { failed: -1 },
    ])
      expect(
        planTaskTransition(running, {
          action: "progress",
          progress: 25,
          summary,
        }),
      ).toEqual({ error: 90001 });
    for (const status of ["succeeded", "partial"] as const)
      expect(
        planTaskTransition(running, {
          action: "finish",
          status,
          summary: { processed: 100 },
        }),
      ).toMatchObject({ state: { status, progress: 100 } });
    expect(planTaskTransition(running, { action: "fail" })).toMatchObject({
      state: { status: "failed", progress: 25 },
    });
  });
});

import { Inject, Injectable } from "@nestjs/common";
import {
  idSchema,
  taskSummarySchema,
  versionSchema,
} from "@smart-sport/contracts";
import { planTaskTransition, type TaskCommand } from "@smart-sport/domain";
import { ApiException } from "../../../api-response.js";
import { taskResponse, taskState } from "./task-mapper.js";
import {
  type TaskRow,
  TasksRepository,
  type TaskTransaction,
} from "./tasks.repository.js";

@Injectable()
export class TaskExecutionService {
  constructor(
    @Inject(TasksRepository) private readonly repository: TasksRepository,
  ) {}
  /** 仅供内部执行程序取检查点；没有HTTP入口，不包含任意业务载荷或存储地址。 */
  async checkpoint(id: string) {
    return this.repository.transaction(async (tx) => {
      const row = await this.repository.lock(
        tx,
        idSchema.parse(id).toLowerCase(),
      );
      if (!row) throw new ApiException(90004);
      return taskResponse(row);
    });
  }
  /** 执行程序必须持当前版本；可加入业务事务，重复消费者和旧检查点不能覆盖任务状态。 */
  async transition(
    id: string,
    version: number,
    command: Exclude<TaskCommand, { action: "cancel" }>,
    tx?: TaskTransaction,
  ) {
    idSchema.parse(id);
    versionSchema.parse(version);
    if (command.action === "progress" || command.action === "finish")
      taskSummarySchema.parse(command.summary);
    const run = async (transaction: TaskTransaction) => {
      const row = await this.repository.lock(transaction, id.toLowerCase());
      if (!row) throw new ApiException(90004);
      if (row.version !== version) throw new ApiException(90002);
      return taskResponse(await this.apply(transaction, row, command));
    };
    return tx ? run(tx) : this.repository.transaction(run);
  }
  /** 模块内部共用同一状态机；外部只经transition调用，不暴露Repository写入。 */
  async apply(tx: TaskTransaction, row: TaskRow, command: TaskCommand) {
    const plan = planTaskTransition(taskState(row), command);
    if ("error" in plan) {
      if (plan.error === 90001)
        throw new ApiException(90001, {
          fields: { _request: ["进度和统计不能回退或超出有效范围"] },
        });
      throw new ApiException(plan.error);
    }
    const { state } = plan;
    const now = new Date();
    return this.repository.save(tx, row, {
      status: state.status,
      progress: state.progress,
      summary: state.summary,
      cancelRequestedAt:
        row.cancelRequestedAt ?? (state.cancelRequested ? now : null),
      startedAt: row.startedAt ?? (command.action === "start" ? now : null),
      finishedAt: ["queued", "running"].includes(state.status) ? null : now,
      error:
        state.status === "failed" ? "任务执行失败，请重试或联系管理员" : null,
    });
  }
}

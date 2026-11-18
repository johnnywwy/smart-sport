import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  type CancelTask,
  idSchema,
  type TaskListQuery,
  type TaskSummary,
  type TaskType,
  taskSummarySchema,
  taskTypeSchema,
} from "@smart-sport/contracts";
import { ApiException } from "../../../api-response.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../../platform/identity-context/index.js";
import { NumbersService } from "../numbers/index.js";
import { TaskExecutionService } from "./task-execution.service.js";
import { taskResponse } from "./task-mapper.js";
import { TasksRepository, type TaskTransaction } from "./tasks.repository.js";
@Injectable()
export class TasksService {
  constructor(
    @Inject(TasksRepository) private readonly repository: TasksRepository,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
    @Inject(NumbersService) private readonly numbers: NumbersService,
    @Inject(TaskExecutionService)
    private readonly execution: TaskExecutionService,
  ) {}
  /** 全局任务中心只读本人身份；同账号其他身份不共享。 */
  async list(actor: IdentityContext, query: TaskListQuery) {
    const { context, revision } = await this.snapshot(actor);
    const result = await this.repository.list(
      context.identityId,
      context.orgId,
      query,
    );
    await this.current(revision);
    return {
      ...result,
      items: result.items.map(taskResponse),
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  async detail(actor: IdentityContext, id: string) {
    const { context, revision } = await this.snapshot(actor);
    const row = await this.repository.detail(
      id.toLowerCase(),
      context.identityId,
      context.orgId,
    );
    if (!row) throw new ApiException(90004);
    await this.current(revision);
    return taskResponse(row);
  }
  /** 取消持有权限修订屏障并重读身份，版本和状态与worker竞争同一行锁。 */
  async cancel(actor: IdentityContext, id: string, input: CancelTask) {
    return this.repository.transaction(async (tx) => {
      await this.repository.lockPolicy(tx);
      const { context } = await this.snapshot(actor);
      const row = await this.repository.lock(tx, id.toLowerCase(), context);
      if (!row) throw new ApiException(90004);
      if (row.version !== input.version) throw new ApiException(90002);
      return taskResponse(
        await this.execution.apply(tx, row, { action: "cancel" }),
      );
    });
  }
  /** 业务模块先验证业务权限/学校范围再调用；任务与编号共用业务事务，不负责Redis投递。 */
  async create(
    actor: IdentityContext,
    input: { type: TaskType; schoolId: string | null; summary?: TaskSummary },
    tx?: TaskTransaction,
  ) {
    taskTypeSchema.parse(input.type);
    const summary = taskSummarySchema.parse(input.summary ?? {});
    if (
      [
        summary.processed,
        summary.succeeded,
        summary.failed,
        summary.skipped,
      ].some((value) => (value ?? 0) !== 0)
    )
      throw new ApiException(90001, {
        fields: { summary: ["排队任务不能预填已处理数量"] },
      });
    const schoolId = input.schoolId
      ? idSchema.parse(input.schoolId).toLowerCase()
      : null;
    const run = async (transaction: TaskTransaction) => {
      await this.repository.lockPolicy(transaction);
      const { context } = await this.snapshot(actor);
      if (context.orgType === "school" && schoolId !== context.orgId)
        throw new ApiException(90004);
      const no = await this.numbers.next("task", transaction);
      const row = await this.repository.create(transaction, {
        no,
        type: input.type,
        schoolId,
        summary,
        identityId: context.identityId,
        orgId: context.orgId,
        createdBy: context.identityId,
        updatedBy: context.identityId,
      });
      return taskResponse(row);
    };
    return tx ? run(tx) : this.repository.transaction(run);
  }
  private async snapshot(actor: IdentityContext) {
    const snapshot = await this.contexts.loadSnapshot(
      actor.identityId,
      actor.client,
    );
    if (
      snapshot.context.userId !== actor.userId ||
      snapshot.context.tokenVersion !== actor.tokenVersion
    )
      throw new ApiException(10005);
    return snapshot;
  }
  private async current(revision: string) {
    if (!(await this.contexts.isCurrent(revision)))
      throw new ServiceUnavailableException("身份权限正在变更，请重试");
  }
}

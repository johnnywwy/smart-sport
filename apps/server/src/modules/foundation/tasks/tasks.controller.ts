import {
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
} from "@nestjs/common";
import {
  type CancelTask,
  cancelTaskSchema,
  successResponseSchema,
  type TaskListQuery,
  taskListQuerySchema,
  taskListSchema,
  taskParamsSchema,
  taskSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../../platform/identity-context/index.js";
import { TasksService } from "./tasks.service.js";
/** spec04明确为身份级登录全局功能，仅本人任务，无平台代查权限。 */
@Controller("api/v1/tasks")
export class TasksController {
  constructor(
    @Inject(TasksService) private readonly service: TasksService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Get()
  @Header("Cache-Control", "no-store")
  @ApiZodResponse(
    200,
    successResponseSchema(taskListSchema),
    "查询本人任务及进行中计数",
  )
  list(@ZodRequest("query", taskListQuerySchema) query: TaskListQuery) {
    return this.service.list(
      this.cls.get<IdentityContext>("identityContext"),
      query,
    );
  }
  @Get(":id")
  @Header("Cache-Control", "no-store")
  @ApiZodResponse(200, successResponseSchema(taskSchema), "查询本人任务进度")
  detail(@ZodRequest("params", taskParamsSchema) params: { id: string }) {
    return this.service.detail(
      this.cls.get<IdentityContext>("identityContext"),
      params.id,
    );
  }
  @Post(":id/cancel")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiZodResponse(
    200,
    successResponseSchema(taskSchema),
    "取消排队任务或申请停止运行任务",
  )
  cancel(
    @ZodRequest("params", taskParamsSchema) params: { id: string },
    @ZodRequest("body", cancelTaskSchema) input: CancelTask,
  ) {
    return this.service.cancel(
      this.cls.get<IdentityContext>("identityContext"),
      params.id,
      input,
    );
  }
}

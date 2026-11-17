import type { IncomingMessage } from "node:http";
import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import {
  academicEmptyQuerySchema,
  academicParamsSchema,
  academicYearListSchema,
  academicYearOptionsSchema,
  academicYearSchema,
  type CreateAcademicYear,
  createAcademicYearSchema,
  currentAcademicSchema,
  semesterSchema,
  setCurrentSemesterSchema,
  successResponseSchema,
  type UpdateSemester,
  updateSemesterSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { Idempotent } from "../../../idempotency.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../identity-context/index.js";
import { AcademicService } from "./academic.service.js";

@Controller("api/v1")
export class AcademicController {
  constructor(
    @Inject(AcademicService) private readonly service: AcademicService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  // 全局登录功能，仍由 AuthenticatedGuard 要求有效身份级令牌。
  @Get("academic-years")
  @ApiZodResponse(
    200,
    successResponseSchema(academicYearListSchema),
    "全平台学年及学期",
  )
  list(@ZodRequest("query", academicEmptyQuerySchema) _query: unknown) {
    return this.service.list(this.actor());
  }
  @Get("academic-years/current")
  @ApiZodResponse(
    200,
    successResponseSchema(currentAcademicSchema),
    "当前学年与学期",
  )
  current(@ZodRequest("query", academicEmptyQuerySchema) _query: unknown) {
    return this.service.current(this.actor());
  }
  @Get("academic-years/options")
  @ApiZodResponse(
    200,
    successResponseSchema(academicYearOptionsSchema),
    "学年新建操作能力",
  )
  options(@ZodRequest("query", academicEmptyQuerySchema) _query: unknown) {
    return this.service.options(this.actor());
  }
  @Post("academic-years")
  @RequirePermissions("system:academic:create")
  @Idempotent(
    "academic.year.create",
    (context) =>
      context.switchToHttp().getRequest<{ auth: { identityId: string } }>().auth
        .identityId,
  )
  @ApiZodResponse(
    201,
    successResponseSchema(academicYearSchema),
    "新建学年及两个学期",
  )
  create(
    @ZodRequest("body", createAcademicYearSchema) input: CreateAcademicYear,
    @Req() request: IncomingMessage,
  ) {
    return this.service.create(input, this.actor(), this.metadata(request));
  }
  @Patch("semesters/:id")
  @RequirePermissions("system:academic:update")
  @ApiZodResponse(200, successResponseSchema(semesterSchema), "调整学期日期")
  update(
    @ZodRequest("params", academicParamsSchema) params: { id: string },
    @ZodRequest("body", updateSemesterSchema) input: UpdateSemester,
    @Req() request: IncomingMessage,
  ) {
    return this.service.update(
      params.id,
      input,
      this.actor(),
      this.metadata(request),
    );
  }
  @Post("semesters/:id/set-current")
  @HttpCode(200)
  @RequirePermissions("system:academic:update")
  @Idempotent(
    "academic.semester.set_current",
    (context) =>
      context.switchToHttp().getRequest<{ auth: { identityId: string } }>().auth
        .identityId,
  )
  @ApiZodResponse(
    200,
    successResponseSchema(currentAcademicSchema),
    "切换当前学期并关闭旧学年",
  )
  setCurrent(
    @ZodRequest("params", academicParamsSchema) params: { id: string },
    @ZodRequest("body", setCurrentSemesterSchema) input: { version: number },
    @Req() request: IncomingMessage,
  ) {
    return this.service.setCurrent(
      params.id,
      input.version,
      this.actor(),
      this.metadata(request),
    );
  }
  private actor() {
    return this.cls.get<IdentityContext>("identityContext");
  }
  private metadata(request: IncomingMessage) {
    return {
      traceId: this.cls.getId(),
      ip: request.socket.remoteAddress ?? "unknown",
      userAgent: request.headers["user-agent"] ?? "",
    };
  }
}

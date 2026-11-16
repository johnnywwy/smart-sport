import type { IncomingMessage } from "node:http";
import { Controller, Get, Inject, Patch, Req, UseGuards } from "@nestjs/common";
import {
  schoolProfileParamsSchema,
  schoolProfileSchema,
  successResponseSchema,
  type UpdateSchoolProfile,
  updateSchoolProfileSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { ApiException, invalidRequest } from "../../../api-response.js";
import { RequirePermissions } from "../../../core/permission.guard.js";
import { SchoolScoped } from "../../../core/school-scoped.js";
import { Idempotent } from "../../../idempotency.js";
import { ApiZodResponse, ZodRequest } from "../../../zod-route.js";
import type { IdentityContext } from "../identity-context/index.js";
import {
  type ProfileRequest,
  SchoolProfileGuard,
} from "./school-profile.guard.js";
import { SchoolProfilesService } from "./school-profiles.service.js";

const profileValidationError: typeof invalidRequest = (issues) =>
  issues.every(
    (issue) => issue.path[0] === "stages" || issue.path[0] === "stageYears",
  )
    ? new ApiException(12006)
    : invalidRequest(issues);

@Controller("api/v1/schools/:schoolId/profile")
@SchoolScoped()
@UseGuards(SchoolProfileGuard)
export class SchoolProfilesController {
  constructor(
    @Inject(SchoolProfilesService)
    private readonly service: SchoolProfilesService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  @Get()
  @RequirePermissions("school:profile:view")
  @ApiZodResponse(
    200,
    successResponseSchema(schoolProfileSchema),
    "查看学校档案",
  )
  read(
    @ZodRequest("params", schoolProfileParamsSchema) params: {
      schoolId: string;
    },
    @Req() request: IncomingMessage,
  ) {
    return this.service.read(
      params.schoolId,
      this.actor(),
      this.metadata(request),
    );
  }
  @Patch()
  @RequirePermissions("school:profile:update")
  @Idempotent("school.profile.update", (context) => {
    const request = context.switchToHttp().getRequest<ProfileRequest>();
    return request.auth?.identityId
      ? `${request.auth.identityId}:${request.params.schoolId?.toLowerCase()}`
      : undefined;
  })
  @ApiZodResponse(
    200,
    successResponseSchema(schoolProfileSchema),
    "修改学校档案",
  )
  update(
    @ZodRequest("params", schoolProfileParamsSchema) params: {
      schoolId: string;
    },
    @ZodRequest("body", updateSchoolProfileSchema, profileValidationError)
    input: UpdateSchoolProfile,
    @Req() request: IncomingMessage,
  ) {
    return this.service.update(
      params.schoolId,
      input,
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

import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { idSchema } from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { ApiException } from "../../../api-response.js";
import type { AuthenticatedRequest } from "../../../core/authenticated.guard.js";
import type { IdentityContext } from "../identity-context/index.js";
import { SchoolProfilesService } from "./school-profiles.service.js";

export type ProfileRequest = AuthenticatedRequest & {
  params: { schoolId?: string };
  method: string;
};
@Injectable()
export class SchoolProfileGuard implements CanActivate {
  constructor(
    @Inject(SchoolProfilesService)
    private readonly service: SchoolProfilesService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<ProfileRequest>();
    const parsed = idSchema.safeParse(request.params.schoolId);
    if (!parsed.success) throw new ApiException(90004);
    // 在幂等拦截器前验证当前学校范围，重放不能返回已失去权限的旧档案。
    await this.service.authorize(
      parsed.data.toLowerCase(),
      this.cls.get<IdentityContext>("identityContext"),
      request.method === "PATCH",
    );
    return true;
  }
}

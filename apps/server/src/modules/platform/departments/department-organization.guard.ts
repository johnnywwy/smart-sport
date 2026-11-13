import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { departmentOrgQuerySchema } from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { ApiException } from "../../../api-response.js";
import type { AuthenticatedRequest } from "../../../core/authenticated.guard.js";
import type { IdentityContext } from "../identity-context/index.js";
import { DepartmentsService } from "./departments.service.js";

export type DepartmentRequest = AuthenticatedRequest & {
  query?: unknown;
  departmentOrgId?: string;
};
@Injectable()
export class DepartmentOrganizationGuard implements CanActivate {
  constructor(
    @Inject(DepartmentsService) private readonly service: DepartmentsService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<DepartmentRequest>();
    const query = departmentOrgQuerySchema.safeParse(request.query ?? {});
    if (!query.success)
      throw new ApiException(90001, {
        fields: { _request: ["组织参数不合法"] },
      });
    const actor = this.cls.get<IdentityContext | undefined>("identityContext");
    if (!actor) throw new ApiException(11101);
    request.departmentOrgId = await this.service.resolveOrganization(
      actor,
      query.data,
    );
    return true;
  }
}

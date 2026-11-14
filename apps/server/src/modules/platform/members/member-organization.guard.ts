import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { memberOrgQuerySchema } from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { ApiException } from "../../../api-response.js";
import type { AuthenticatedRequest } from "../../../core/authenticated.guard.js";
import type { IdentityContext } from "../identity-context/index.js";
import { MembersService } from "./members.service.js";
export type MembersRequest = AuthenticatedRequest & {
  query?: unknown;
  membersOrgId?: string;
};
@Injectable()
export class MemberOrganizationGuard implements CanActivate {
  constructor(
    @Inject(MembersService) private readonly service: MembersService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<MembersRequest>();
    const raw = request.query as { orgId?: unknown } | undefined;
    const query = memberOrgQuerySchema.safeParse({
      ...(raw?.orgId !== undefined ? { orgId: raw.orgId } : {}),
    });
    if (!query.success) throw new ApiException(90001);
    const actor = this.cls.get<IdentityContext | undefined>("identityContext");
    if (!actor) throw new ApiException(11101);
    const create =
      request.method === "POST" &&
      !request.url?.split("?")[0]?.replace(/\/$/, "").endsWith("/status");
    const permission = create
      ? "org:member:create"
      : request.method === "GET"
        ? "org:member:view"
        : "org:member:update";
    request.membersOrgId = await this.service.resolveOrganization(
      actor,
      query.data.orgId ?? actor.orgId,
      create,
      permission,
    );
    return true;
  }
}

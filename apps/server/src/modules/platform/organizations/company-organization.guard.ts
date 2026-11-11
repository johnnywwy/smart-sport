import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../../../core/authenticated.guard.js";
import { OrganizationsRepository } from "./organizations.repository.js";

export type CompanyOrganizationRequest = AuthenticatedRequest & {
  companyActor?: { userId: string; identityId: string; orgId: string };
};

@Injectable()
export class CompanyOrganizationGuard implements CanActivate {
  constructor(
    @Inject(OrganizationsRepository)
    private readonly organizations: OrganizationsRepository,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<CompanyOrganizationRequest>();
    if (request.auth?.stage !== "identity" || !request.auth.identityId) {
      throw new ForbiddenException();
    }
    const actor = await this.organizations.findCompanyActor(
      request.auth.identityId,
    );
    if (!actor || actor.userId !== request.auth.userId) {
      throw new ForbiddenException();
    }
    request.companyActor = actor;
    return true;
  }
}

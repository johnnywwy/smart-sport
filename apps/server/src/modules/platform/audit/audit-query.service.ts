import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { AuditLogQuery } from "@smart-sport/contracts";
import { ApiException } from "../../../api-response.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../identity-context/index.js";
import { auditLogResponse } from "./audit-query.mapper.js";
import { AuditQueryRepository } from "./audit-query.repository.js";

@Injectable()
export class AuditQueryService {
  constructor(
    @Inject(AuditQueryRepository)
    private readonly repository: AuditQueryRepository,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
  ) {}

  /** 本组织始终按操作发生时的组织归属过滤，全平台只对公司且有全平台审计权限开放。 */
  async list(input: AuditLogQuery, actor: IdentityContext) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { context, revision } = await this.contexts.loadSnapshot(
        actor.identityId,
        actor.client,
      );
      if (
        context.userId !== actor.userId ||
        context.tokenVersion !== actor.tokenVersion
      )
        throw new ApiException(10005);
      this.authorize(input, context);
      const result = await this.repository.list(
        input,
        input.scope === "platform" ? null : context.orgId,
      );
      if (await this.contexts.isCurrent(revision))
        return { ...result, items: result.items.map(auditLogResponse) };
    }
    throw new ServiceUnavailableException("权限正在变更，请重试");
  }
  private authorize(input: AuditLogQuery, actor: IdentityContext) {
    if (input.scope === "platform") {
      if (
        actor.identityType !== "company" ||
        !actor.permissions.has("system:audit:view")
      )
        throw new ApiException(11101);
    } else if (!actor.permissions.has("org:audit:view")) {
      throw new ApiException(11101);
    }
  }
}

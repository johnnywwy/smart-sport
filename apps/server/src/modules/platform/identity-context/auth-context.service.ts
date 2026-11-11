import { Inject, Injectable } from "@nestjs/common";
import { ApiException } from "../../../api-response.js";
import type { AuthenticatedClaims } from "../../../core/authenticated.guard.js";
import { ContextRepository } from "./context.repository.js";
import { IdentityContextService } from "./context.service.js";

@Injectable()
export class AuthContextService {
  constructor(
    @Inject(ContextRepository) private readonly repository: ContextRepository,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
  ) {}

  /** 从数据库核验会话，避免退出、改密或跨标签页切换后命中旧缓存。 */
  async authenticate(claims: AuthenticatedClaims) {
    const row = await this.repository.session(claims.sessionId);
    if (
      !row ||
      row.session.userId !== claims.userId ||
      row.user.deletedAt ||
      row.user.status !== 1 ||
      row.user.tokenVersion !== claims.tokenVersion ||
      row.session.client !== "admin" ||
      row.session.revokedAt ||
      row.session.expiresAt <= new Date()
    )
      throw new ApiException(10005);
    await this.contexts.cacheSession(row.session);
    if (claims.stage === "account") return undefined;
    if (!claims.identityId || claims.identityId !== row.session.identityId)
      throw new ApiException(11005);
    const context = await this.contexts.load(claims.identityId);
    if (
      context.userId !== claims.userId ||
      context.tokenVersion !== claims.tokenVersion
    )
      throw new ApiException(10005);
    return context;
  }
}

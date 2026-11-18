import { Inject, Injectable } from "@nestjs/common";
import type { DeclaredPermissionCode } from "@smart-sport/contracts";
import { ApiException } from "../../../api-response.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../identity-context/index.js";
import { ScopeService } from "../scope/index.js";
import { SubscriptionStateService } from "../subscription/index.js";

type ProfilePermission = Extract<
  DeclaredPermissionCode,
  "school:profile:view" | "school:profile:update"
>;
@Injectable()
export class SchoolProfilePolicy {
  constructor(
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
    @Inject(ScopeService) private readonly scopes: ScopeService,
    @Inject(SubscriptionStateService)
    private readonly subscriptions: SubscriptionStateService,
  ) {}
  async actor(actor: IdentityContext, permission: ProfilePermission) {
    const fresh = await this.contexts.load(actor.identityId, actor.client);
    if (
      fresh.userId !== actor.userId ||
      fresh.tokenVersion !== actor.tokenVersion
    )
      throw new ApiException(10005);
    if (!fresh.permissions.has(permission)) throw new ApiException(11101);
    return fresh;
  }
  private async visible(
    actor: IdentityContext,
    schoolId: string,
    permission: ProfilePermission,
  ) {
    const option = actor.permissions.get(permission);
    if (!option) return false;
    if (actor.identityType === "company")
      try {
        await this.scopes.requireSchool(actor.identityId, permission, schoolId);
        return true;
      } catch (error) {
        if (error instanceof ApiException && error.code === 90004) return false;
        throw error;
      }
    // 档案是整校级信息；本校 all 已有完整边界，细粒度年级/学院与代理授权尚未开放。
    return (
      actor.orgType === "school" &&
      (actor.identityType === "school" || actor.identityType === "teacher") &&
      actor.orgId === schoolId &&
      option === "all"
    );
  }
  async allows(
    actor: IdentityContext,
    schoolId: string,
    permission: ProfilePermission,
  ) {
    if (!(await this.visible(actor, schoolId, permission))) return false;
    try {
      await this.subscriptions.requireAccess(schoolId, permission, actor);
      return true;
    } catch (error) {
      if (
        error instanceof ApiException &&
        [13001, 13002, 13003].includes(error.code)
      )
        return false;
      throw error;
    }
  }
  async require(
    actor: IdentityContext,
    schoolId: string,
    permission: ProfilePermission,
  ) {
    if (!(await this.visible(actor, schoolId, permission)))
      throw new ApiException(90004);
    await this.subscriptions.requireAccess(schoolId, permission, actor);
  }
}

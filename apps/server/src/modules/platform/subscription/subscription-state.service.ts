import { Inject, Injectable } from "@nestjs/common";
import {
  type AppCode,
  type DataScopeOption,
  type DeclaredPermissionCode,
  type IdentityType,
  schoolAppsSchema,
} from "@smart-sport/contracts";
import {
  isSchoolAdministrator,
  shanghaiDate,
  subscriptionAccessError,
  subscriptionGraceEnd,
  subscriptionStatus,
} from "@smart-sport/domain";
import { ApiException } from "../../../api-response.js";
import { schoolAppResponse } from "./subscription.mapper.js";
import {
  SubscriptionRepository,
  type SubscriptionTransaction,
} from "./subscription.repository.js";
export type ServiceActor = {
  orgId: string;
  orgType: string;
  identityType: IdentityType;
  permissions: ReadonlyMap<string, DataScopeOption>;
};
@Injectable()
export class SubscriptionStateService {
  constructor(
    @Inject(SubscriptionRepository)
    private readonly repository: SubscriptionRepository,
  ) {}
  async requireEntry(actor: ServiceActor) {
    if (actor.orgType !== "school") return;
    const { subscription } = await this.repository.snapshot(actor.orgId);
    const today = shanghaiDate(new Date());
    if (subscriptionStatus(subscription, today) !== "suspended") return;
    if (
      subscription &&
      today > shanghaiDate(subscription.serviceEnd) &&
      isSchoolAdministrator(actor.identityType, actor.permissions)
    )
      return;
    throw new ApiException(13003);
  }
  /** 校验服务限制；调用方必须先验证角色权限与目标学校可见性，不能据此授予角色权限。 */
  async requireAccess(
    schoolId: string,
    permission: DeclaredPermissionCode,
    actor: ServiceActor,
    tx?: SubscriptionTransaction,
  ) {
    const { subscription, apps } = await this.repository.snapshot(schoolId, tx);
    const [app, , action] = permission.split(":");
    const error = subscriptionAccessError(
      subscription,
      apps,
      shanghaiDate(new Date()),
      app ?? "",
      action ?? "",
      actor.orgId === schoolId &&
        isSchoolAdministrator(actor.identityType, actor.permissions),
    );
    if (error) throw new ApiException(error);
  }
  async ownPermissions(actor: ServiceActor) {
    if (actor.orgType !== "school")
      return { permissions: new Map(actor.permissions), exportOnly: false };
    const { subscription, apps } = await this.repository.snapshot(actor.orgId);
    const today = shanghaiDate(new Date());
    const administrator = isSchoolAdministrator(
      actor.identityType,
      actor.permissions,
    );
    return {
      exportOnly:
        subscriptionStatus(subscription, today) === "suspended" &&
        administrator,
      permissions: new Map(
        [...actor.permissions].filter(([permission]) => {
          const [app, , action] = permission.split(":");
          return !subscriptionAccessError(
            subscription,
            apps,
            today,
            app ?? "",
            action ?? "",
            administrator,
          );
        }),
      ),
    };
  }
  async ownError(
    actor: ServiceActor,
    permissions: DeclaredPermissionCode[],
    schoolId?: string,
  ) {
    if (actor.orgType !== "school") return;
    if (schoolId && schoolId.toLowerCase() !== actor.orgId)
      throw new ApiException(90004);
    for (const permission of permissions)
      await this.requireAccess(actor.orgId, permission, actor);
  }
  async apps(schoolId: string, actor: ServiceActor) {
    const { subscription, apps } = await this.repository.snapshot(schoolId);
    const today = shanghaiDate(new Date()),
      status = subscriptionStatus(subscription, today);
    const administrator =
      actor.orgId === schoolId &&
      isSchoolAdministrator(actor.identityType, actor.permissions);
    const action = status === "suspended" ? "export" : "view";
    return schoolAppsSchema.parse({
      schoolId,
      status,
      serviceEnd: subscription ? shanghaiDate(subscription.serviceEnd) : null,
      graceEnd: subscription ? subscriptionGraceEnd(subscription) : null,
      accessMode:
        status === "suspended"
          ? administrator &&
            subscription &&
            today > shanghaiDate(subscription.serviceEnd)
            ? "export"
            : "unavailable"
          : status === "grace"
            ? "readonly"
            : "full",
      apps: apps
        .filter(
          (app) =>
            !subscriptionAccessError(
              subscription,
              apps,
              today,
              app.appCode as AppCode,
              action,
              administrator,
            ),
        )
        .map(schoolAppResponse),
    });
  }
}

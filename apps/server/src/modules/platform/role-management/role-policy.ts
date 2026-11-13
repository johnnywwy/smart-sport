import {
  appDefinitions,
  type DataScopeOption,
  type PresetFeatureGrant,
} from "@smart-sport/contracts";
import { expandGrant } from "@smart-sport/domain";
import type { IdentityContext } from "../identity-context/index.js";

export type RoleActor = Pick<
  IdentityContext,
  "userId" | "identityId" | "orgId" | "orgType" | "roleIds" | "permissions"
>;
export type RoleMetadata = { traceId: string; ip: string; userAgent: string };
export const roleFeatures = appDefinitions.flatMap((app) =>
  Object.entries(app.features).map(([feature, definition]) => ({
    app: app.code,
    feature,
    appName: app.name,
    featureName: definition.name,
    actions: [...definition.actions],
    identityTypes: [...app.identityTypes] as string[],
  })),
);
const rank: Record<DataScopeOption, number> = {
  personal: 0,
  dept: 1,
  dept_and_below: 2,
  all: 3,
};
export const organizationIdentityTypes = (orgType: RoleActor["orgType"]) =>
  orgType === "school" ? ["school", "teacher"] : [orgType];

/** 每项动作分别比较授予它的数据范围，不能借用其他权限的较宽范围。 */
export function withinRoleCeiling(
  grants: PresetFeatureGrant[],
  scope: DataScopeOption,
  permissions: RoleActor["permissions"],
) {
  if (
    rank[scope] > Math.max(-1, ...[...permissions.values()].map((v) => rank[v]))
  )
    return false;
  return grants.every((entry) => {
    const feature = roleFeatures.find(
      (value) => value.app === entry.app && value.feature === entry.feature,
    );
    if (!feature) return false;
    return expandGrant(feature, entry.grant).every((code) => {
      const allowed = permissions.get(code);
      return allowed !== undefined && rank[allowed] >= rank[scope];
    });
  });
}

export function grantsFitIdentity(
  grants: PresetFeatureGrant[],
  identityType: string,
) {
  return grants.every((entry) => {
    const feature = roleFeatures.find(
      (value) => value.app === entry.app && value.feature === entry.feature,
    );
    return (
      feature !== undefined &&
      (feature.identityTypes.includes(identityType) ||
        expandGrant(feature, entry.grant).length === 0)
    );
  });
}

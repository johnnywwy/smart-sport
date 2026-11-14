import {
  appDefinitions,
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
export const organizationIdentityTypes = (orgType: RoleActor["orgType"]) =>
  orgType === "school" ? ["school", "teacher"] : [orgType];

export { withinRoleCeiling } from "@smart-sport/domain";

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

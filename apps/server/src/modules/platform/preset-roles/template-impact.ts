import {
  moduleDefinitions,
  type PresetFeatureGrant,
} from "@smart-sport/contracts";
import { expandGrant, resolveRoleGrants } from "@smart-sport/domain";
import { templateFeatures } from "./template-values.js";

function visibleMenus(grants: PresetFeatureGrant[], identityType: string) {
  const permissions = new Set(
    grants.flatMap((item) => {
      const definition = templateFeatures.find(
        (f) => f.app === item.app && f.feature === item.feature,
      );
      return definition ? expandGrant(definition, item.grant) : [];
    }),
  );
  return moduleDefinitions
    .filter((m) =>
      (m.identityTypes as readonly string[]).includes(identityType),
    )
    .flatMap((module) =>
      module.groups.flatMap((g) =>
        g.menus
          .filter((menu) =>
            menu.features.some((ref) =>
              permissions.has(`${ref.app}:${ref.feature}:view`),
            ),
          )
          .map((menu) => ({
            key: `${module.code}:${menu.key}`,
            module: module.name,
            name: menu.name,
          })),
      ),
    );
}
export function templateMenuChanges(
  identityType: string,
  before: PresetFeatureGrant[],
  after: PresetFeatureGrant[],
  roles: { id: string; name: string; kind: string }[],
  customGrants: Map<string, PresetFeatureGrant[]>,
) {
  return roles
    .map((role) => {
      const overrides =
        role.kind === "custom" ? (customGrants.get(role.id) ?? []) : [];
      const oldMenus = visibleMenus(
        resolveRoleGrants(before, overrides),
        identityType,
      );
      const newMenus = visibleMenus(
        resolveRoleGrants(after, overrides),
        identityType,
      );
      return {
        roleId: role.id,
        roleName: role.name,
        added: newMenus
          .filter((m) => !oldMenus.some((old) => old.key === m.key))
          .map(({ module, name }) => ({ module, name })),
        removed: oldMenus
          .filter((m) => !newMenus.some((next) => next.key === m.key))
          .map(({ module, name }) => ({ module, name })),
      };
    })
    .filter((r) => r.added.length || r.removed.length);
}

import {
  type Action,
  type DataScopeOption,
  dataScopeSchema,
  type FeatureDefinition,
  type FeatureGrant,
  featureSchema,
  grantSchema,
  type PermissionCode,
} from "@smart-sport/contracts";

const levels = {
  none: [],
  view: ["view"],
  edit: ["view", "create", "update"],
} satisfies Record<string, readonly Action[]>;

const scopeRank: Record<DataScopeOption, number> = {
  personal: 0,
  dept: 1,
  dept_and_below: 2,
  all: 3,
};

export function expandGrant(
  definition: FeatureDefinition,
  input: FeatureGrant,
): PermissionCode[] {
  const feature = featureSchema.parse(definition);
  const grant = grantSchema.parse(input);
  const actions: readonly Action[] =
    grant.level === "manage"
      ? feature.actions
      : grant.level === "custom"
        ? grant.actions
        : levels[grant.level];
  const selected = new Set(actions);
  return [...new Set(feature.actions)]
    .filter((action) => selected.has(action))
    .map(
      (action): PermissionCode => `${feature.app}:${feature.feature}:${action}`,
    );
}

export type RolePermissionGrant = {
  feature: FeatureDefinition;
  grant: FeatureGrant;
  scope: DataScopeOption;
};

/** Only roles granting the same permission participate in its scope merge. */
export function mergePermissions(
  grants: readonly RolePermissionGrant[],
): ReadonlyMap<PermissionCode, DataScopeOption> {
  const result = new Map<PermissionCode, DataScopeOption>();
  for (const entry of grants) {
    const scope = dataScopeSchema.parse(entry.scope);
    for (const permission of expandGrant(entry.feature, entry.grant)) {
      const previous = result.get(permission);
      if (previous === undefined || scopeRank[scope] > scopeRank[previous]) {
        result.set(permission, scope);
      }
    }
  }
  return result;
}

export function hasPermission(
  permissions: ReadonlyMap<PermissionCode, DataScopeOption>,
  required: PermissionCode,
): boolean {
  return permissions.has(required);
}

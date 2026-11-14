import {
  type Action,
  appDefinitions,
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

export type FeatureGrantEntry = {
  app: string;
  feature: string;
  grant: FeatureGrant;
};

const grantKey = (entry: Pick<FeatureGrantEntry, "app" | "feature">) =>
  `${entry.app}:${entry.feature}`;

function sameGrant(left: FeatureGrant, right: FeatureGrant) {
  if (left.level !== right.level) return false;
  if (left.level !== "custom" || right.level !== "custom") return true;
  return (
    [...new Set(left.actions)].sort().join(":") ===
    [...new Set(right.actions)].sort().join(":")
  );
}

/** 自定义角色只覆盖已调整模块，其余模块始终跟随基础角色。 */
export function resolveRoleGrants(
  base: readonly FeatureGrantEntry[],
  overrides: readonly FeatureGrantEntry[],
): FeatureGrantEntry[] {
  const result = new Map(base.map((entry) => [grantKey(entry), entry]));
  for (const entry of overrides) result.set(grantKey(entry), entry);
  return [...result.values()].sort((left, right) =>
    grantKey(left).localeCompare(grantKey(right)),
  );
}

/** 整体提交角色档位时，仅返回与基础角色不同的授权行。 */
export function diffRoleGrants(
  base: readonly FeatureGrantEntry[],
  submitted: readonly FeatureGrantEntry[],
): FeatureGrantEntry[] {
  const baseMap = new Map(base.map((entry) => [grantKey(entry), entry.grant]));
  return submitted.filter((entry) => {
    const inherited = baseMap.get(grantKey(entry));
    return !sameGrant(inherited ?? { level: "none" }, entry.grant);
  });
}

/** 同一身份可由多个角色合并取得成员与角色管理的完整动作。 */
export function isOrganizationAdministrator(
  grants: readonly FeatureGrantEntry[],
): boolean {
  const app = appDefinitions.find((entry) => entry.code === "org");
  if (!app) return false;
  return ["member", "role"].every((feature) => {
    const definition = app.features[feature as keyof typeof app.features];
    const required = expandGrant(
      { app: app.code, feature, actions: [...definition.actions] },
      { level: "manage" },
    );
    const granted = new Set(
      grants
        .filter((g) => g.app === app.code && g.feature === feature)
        .flatMap((g) =>
          expandGrant(
            { app: app.code, feature, actions: [...definition.actions] },
            g.grant,
          ),
        ),
    );
    return required.length > 0 && required.every((code) => granted.has(code));
  });
}

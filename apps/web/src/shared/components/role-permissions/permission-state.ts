import {
  type Action,
  appDefinitions,
  type FeatureGrant,
  type IdentityType,
  moduleDefinitions,
  type presetRoleSchema,
  type SavePresetRole,
} from "@smart-sport/contracts";
export type PermissionRole = Pick<
  ReturnType<typeof presetRoleSchema.parse>,
  "identityType" | "grants"
>;
export type PermissionValues = Pick<SavePresetRole, "grants">;
export const identityLabels: Partial<Record<IdentityType, string>> = {
  company: "公司",
  bureau: "教育局",
  agent: "代理商",
  school: "学校",
  teacher: "教师",
};
export const scopeLabels = {
  all: "本机构全部",
  dept_and_below: "本部门和下级部门",
  dept: "只看本部门",
  personal: "只看自己负责的",
} as const;
export const actionLabels: Record<Action, string> = {
  view: "查询",
  create: "新增",
  update: "编辑",
  delete: "删除",
  import: "导入",
  export: "导出",
  approve: "审核",
  sensitive: "查看敏感信息",
};

export function declaredActions(
  app: string,
  feature: string,
): readonly Action[] {
  const definition = appDefinitions.find((item) => item.code === app);
  return (
    Object.entries(definition?.features ?? {}).find(
      ([code]) => code === feature,
    )?.[1].actions ?? []
  );
}

/** 仅用于配置预览；接口授权始终由服务端计算。 */
export function previewActions(
  app: string,
  feature: string,
  grant: FeatureGrant,
) {
  const actions = declaredActions(app, feature);
  if (grant.level === "manage") return [...actions];
  if (grant.level === "custom")
    return actions.filter((action) => grant.actions.includes(action));
  const selected: readonly Action[] =
    grant.level === "edit"
      ? ["view", "create", "update"]
      : grant.level === "view"
        ? ["view"]
        : [];
  return actions.filter((action) => selected.includes(action));
}

export function sameGrant(left: FeatureGrant, right: FeatureGrant) {
  if (left.level !== right.level) return false;
  return (
    left.level !== "custom" ||
    right.level !== "custom" ||
    [...left.actions].sort().join() === [...right.actions].sort().join()
  );
}

export type ConfigurationItem = {
  key: string;
  name: string;
  features: PermissionRole["grants"];
};
export type ConfigurationGroup = {
  key: string;
  name: string;
  items: ConfigurationItem[];
};

/** 用导航名称展示菜单，细调时保留每个实际功能的独立档位。 */
export function configurationGroups(
  role: PermissionRole,
): ConfigurationGroup[] {
  const seen = new Set<string>();
  const supported = new Set(
    appDefinitions
      .filter((app) =>
        (app.identityTypes as readonly string[]).includes(role.identityType),
      )
      .map((app) => String(app.code)),
  );
  const groups: ConfigurationGroup[] = moduleDefinitions
    .filter((module) =>
      (module.identityTypes as readonly string[]).includes(role.identityType),
    )
    .flatMap((module) =>
      module.groups.map((group) => ({
        key: `${module.code}:${group.key}`,
        name: group.name,
        items: group.menus.flatMap((menu) => {
          const features = menu.features.flatMap((ref) => {
            const key = `${ref.app}:${ref.feature}`;
            const feature = role.grants.find(
              (entry) => entry.app === ref.app && entry.feature === ref.feature,
            );
            if (!feature || seen.has(key) || !supported.has(ref.app)) return [];
            seen.add(key);
            return [feature];
          });
          return features.length
            ? [{ key: menu.key, name: menu.name, features }]
            : [];
        }),
      })),
    )
    .filter((group) => group.items.length);
  return groups;
}

export function applyMenuGrant(
  values: PermissionValues,
  features: ConfigurationItem["features"],
  grant: FeatureGrant,
) {
  return values.grants.map((entry) => {
    if (
      !features.some(
        (feature) =>
          feature.app === entry.app && feature.feature === entry.feature,
      )
    )
      return entry;
    const supported = declaredActions(entry.app, entry.feature);
    return {
      ...entry,
      grant:
        grant.level === "custom"
          ? {
              level: "custom" as const,
              actions: grant.actions.filter((action) =>
                supported.includes(action),
              ),
            }
          : grant,
    };
  });
}

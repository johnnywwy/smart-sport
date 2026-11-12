import {
  type Action,
  appDefinitions,
  type FeatureGrant,
  type IdentityType,
  moduleDefinitions,
  type presetRoleImpactSchema,
  type presetRoleSchema,
  type ResetPresetRole,
  resetPresetRoleSchema,
  type SavePresetRole,
} from "@smart-sport/contracts";

export type PresetRole = ReturnType<typeof presetRoleSchema.parse>;
export type TemplateImpact = ReturnType<typeof presetRoleImpactSchema.parse>;
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

export function templateValues(role: PresetRole): SavePresetRole {
  return {
    version: role.version,
    dataScope: role.dataScope,
    remark: role.remark,
    grants: role.grants.map(({ app, feature, grant }) => ({
      app,
      feature,
      grant,
    })),
  };
}

/** 仅提交恢复契约需要的标识，不把功能展示字段带进 strict 请求体。 */
export function templateResetInput(
  version: number,
  feature?: { app: string; feature: string },
): ResetPresetRole {
  return resetPresetRoleSchema.parse({
    version,
    ...(feature
      ? { feature: { app: feature.app, feature: feature.feature } }
      : {}),
  });
}

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

export function changedCount(role: PresetRole, values: SavePresetRole) {
  return (
    Number(role.dataScope !== values.dataScope) +
    Number(role.remark !== values.remark) +
    values.grants.filter((entry) => {
      const saved = role.grants.find(
        (item) => item.app === entry.app && item.feature === entry.feature,
      );
      return !saved || !sameGrant(saved.grant, entry.grant);
    }).length
  );
}

export type ConfigurationItem = {
  key: string;
  name: string;
  features: PresetRole["grants"];
};
export type ConfigurationGroup = {
  key: string;
  name: string;
  items: ConfigurationItem[];
};

/** 用导航名称展示菜单，细调时保留每个实际功能的独立档位。 */
export function configurationGroups(role: PresetRole): ConfigurationGroup[] {
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
  values: SavePresetRole,
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

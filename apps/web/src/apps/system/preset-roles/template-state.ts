import {
  type presetRoleImpactSchema,
  type presetRoleSchema,
  type ResetPresetRole,
  resetPresetRoleSchema,
  type SavePresetRole,
} from "@smart-sport/contracts";

import { sameGrant } from "../../../shared/components/role-permissions/permission-state";

export type PresetRole = ReturnType<typeof presetRoleSchema.parse>;
export type TemplateImpact = ReturnType<typeof presetRoleImpactSchema.parse>;
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

export * from "../../../shared/components/role-permissions/permission-state";

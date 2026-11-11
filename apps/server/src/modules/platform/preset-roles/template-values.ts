import {
  appDefinitions,
  type DataScopeOption,
  grantSchema,
  type PresetFeatureGrant,
} from "@smart-sport/contracts";
import { diffRoleGrants, resolveRoleGrants } from "@smart-sport/domain";
import type { presetRoleOverrides, roles } from "../../../schema/public.js";
export const templateFeatures = appDefinitions.flatMap((app) =>
  Object.entries(app.features).map(([feature, definition]) => ({
    app: app.code,
    feature,
    appName: app.name,
    featureName: definition.name,
    actions: [...definition.actions],
  })),
);
export type TemplateRow = {
  role: typeof roles.$inferSelect;
  override: typeof presetRoleOverrides.$inferSelect | null;
};
export function parseGrants(values: unknown): PresetFeatureGrant[] {
  if (!Array.isArray(values)) throw new Error("角色模板覆盖格式异常");
  return values.map((value) => ({
    app: String(value.app),
    feature: String(value.feature),
    grant: grantSchema.parse(value.grant),
  }));
}
export function defaults(
  rows: {
    appCode: string;
    featureCode: string;
    level: string;
    actions: string[] | null;
  }[],
) {
  return templateFeatures.map((feature) => {
    const row = rows.find(
      (r) => r.appCode === feature.app && r.featureCode === feature.feature,
    );
    return {
      app: feature.app,
      feature: feature.feature,
      grant: row
        ? grantSchema.parse(
            row.level === "custom"
              ? { level: row.level, actions: row.actions }
              : { level: row.level },
          )
        : { level: "none" as const },
    };
  });
}
export function effective(row: TemplateRow, base: PresetFeatureGrant[]) {
  return {
    dataScope: (row.override?.dataScope ??
      row.role.dataScope) as DataScopeOption,
    remark: row.override?.remark ?? row.role.remark,
    grants: resolveRoleGrants(
      base,
      row.override ? parseGrants(row.override.grants) : [],
    ),
  };
}
export function differences(
  base: PresetFeatureGrant[],
  submitted: PresetFeatureGrant[],
) {
  return diffRoleGrants(base, submitted);
}

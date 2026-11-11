import { z } from "zod";
import { appDefinitions } from "./apps/registry.js";
import { idSchema, versionSchema } from "./common.js";
import { identityTypeSchema } from "./identities.js";
import { dataScopeSchema, grantSchema } from "./permissions.js";

export const presetFeatureGrantSchema = z.strictObject({
  app: z.string(),
  feature: z.string(),
  grant: grantSchema,
});
const definitions = appDefinitions.flatMap((app) =>
  Object.entries(app.features).map(([feature, definition]) => ({
    app: app.code,
    feature,
    actions: [...definition.actions] as string[],
  })),
);
export const presetTemplateGrantsSchema = z
  .array(presetFeatureGrantSchema)
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      const key = `${item.app}:${item.feature}`;
      const definition = definitions.find(
        (value) => value.app === item.app && value.feature === item.feature,
      );
      if (!definition || seen.has(key))
        ctx.addIssue({
          code: "custom",
          path: [index],
          message: "功能模块不存在或重复",
        });
      if (
        item.grant.level === "custom" &&
        (new Set(item.grant.actions).size !== item.grant.actions.length ||
          item.grant.actions.some(
            (action) => !definition?.actions.includes(action),
          ))
      )
        ctx.addIssue({
          code: "custom",
          path: [index, "grant"],
          message: "动作不存在或重复",
        });
      seen.add(key);
    }
    if (seen.size !== definitions.length)
      ctx.addIssue({
        code: "custom",
        message: "请整体提交全部功能模块的档位，未授权模块使用无权限档",
      });
  });
export const presetRoleParamsSchema = z.strictObject({ id: idSchema });
export const presetRoleQuerySchema = z.strictObject({
  identityType: identityTypeSchema.optional(),
});
export const savePresetRoleSchema = z.strictObject({
  version: versionSchema,
  dataScope: dataScopeSchema,
  remark: z.string().trim().max(500).nullable(),
  grants: presetTemplateGrantsSchema,
});
export const resetPresetRoleSchema = z.strictObject({
  version: versionSchema,
  feature: z.strictObject({ app: z.string(), feature: z.string() }).optional(),
});
export const presetRoleUsageSchema = z.object({
  organizationCount: z.int().nonnegative(),
  userCount: z.int().nonnegative(),
  identityCount: z.int().nonnegative(),
});
export const presetRoleSchema = z.object({
  id: idSchema,
  name: z.string(),
  identityType: identityTypeSchema,
  version: versionSchema,
  dataScope: dataScopeSchema,
  defaultDataScope: dataScopeSchema,
  remark: z.string().nullable(),
  modified: z.boolean(),
  editable: z.boolean(),
  allowedActions: z.array(z.enum(["update", "reset"])),
  grants: z.array(
    presetFeatureGrantSchema.extend({
      appName: z.string(),
      featureName: z.string(),
      defaultGrant: grantSchema,
      modified: z.boolean(),
    }),
  ),
  usage: presetRoleUsageSchema,
});
export const presetRoleListSchema = z.array(presetRoleSchema);
export const presetRoleImpactSchema = presetRoleUsageSchema.extend({
  version: versionSchema,
  dataScopeChanged: z.boolean(),
  menuChanges: z.array(
    z.object({
      roleId: idSchema,
      roleName: z.string(),
      added: z.array(z.object({ module: z.string(), name: z.string() })),
      removed: z.array(z.object({ module: z.string(), name: z.string() })),
    }),
  ),
});
export type SavePresetRole = z.infer<typeof savePresetRoleSchema>;
export type ResetPresetRole = z.infer<typeof resetPresetRoleSchema>;
export type PresetFeatureGrant = z.infer<typeof presetFeatureGrantSchema>;

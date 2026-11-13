import { z } from "zod";
import { idSchema, versionSchema } from "./common.js";
import { identityTypeSchema } from "./identities.js";
import { dataScopeSchema, grantSchema } from "./permissions.js";
import {
  presetFeatureGrantSchema,
  presetTemplateGrantsSchema,
} from "./preset-role-management.js";

export const roleParamsSchema = z.strictObject({ id: idSchema });
export const roleListQuerySchema = z.strictObject({
  identityType: identityTypeSchema.optional(),
});
export const createRoleSchema = z.strictObject({
  name: z.string().trim().min(1).max(64),
  baseRoleId: idSchema,
  dataScope: dataScopeSchema,
});
export const saveRoleGrantsSchema = z.strictObject({
  version: versionSchema,
  dataScope: dataScopeSchema,
  grants: presetTemplateGrantsSchema,
});
export const resetRoleSchema = z.strictObject({ version: versionSchema });
export const roleSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: z.enum(["preset", "custom"]),
  identityType: identityTypeSchema,
  baseRoleId: idSchema.nullable(),
  baseRoleName: z.string().nullable(),
  dataScope: dataScopeSchema,
  remark: z.string().nullable(),
  version: versionSchema,
  modified: z.boolean(),
  allowedActions: z.array(z.enum(["update", "reset"])),
});
export const roleListSchema = z.array(roleSummarySchema);
export const roleDetailSchema = roleSummarySchema.extend({
  grants: z.array(
    presetFeatureGrantSchema.extend({
      appName: z.string(),
      featureName: z.string(),
      baseGrant: grantSchema,
      modified: z.boolean(),
    }),
  ),
});
export type CreateRole = z.infer<typeof createRoleSchema>;
export type SaveRoleGrants = z.infer<typeof saveRoleGrantsSchema>;
export type ResetRole = z.infer<typeof resetRoleSchema>;
export type RoleSummary = z.infer<typeof roleSummarySchema>;
export type RoleDetail = z.infer<typeof roleDetailSchema>;

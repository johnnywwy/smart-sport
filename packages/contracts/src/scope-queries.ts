import { z } from "zod";
import { appDefinitions, type DeclaredPermissionCode } from "./apps/index.js";
import { idSchema, paginatedSchema, paginationQuerySchema } from "./common.js";
import { extraScopesSchema } from "./identity-scopes.js";
import { actionSchema, dataScopeSchema } from "./permissions.js";

const permissions = new Set<string>(
  appDefinitions
    .filter((app) => app.code === "school" || app.code === "ops")
    .flatMap((app) =>
      Object.entries(app.features).flatMap(([feature, definition]) =>
        definition.actions.map(
          (action: string) => `${app.code}:${feature}:${action}`,
        ),
      ),
    ),
);
/** 只能请求已声明的学校业务动作；组织管理权限不能用于扩大业务数据范围。 */
export const scopePermissionSchema = z.custom<DeclaredPermissionCode>(
  (value) => typeof value === "string" && permissions.has(value),
  "请选择已声明的学校业务操作",
);
export const scopeSchoolsQuerySchema = z.strictObject({
  ...paginationQuerySchema.shape,
  keyword: z.string().trim().max(100).optional(),
  permission: scopePermissionSchema.default("ops:school:view"),
});
export const identityVisibleParamsSchema = z.strictObject({ id: idSchema });
export const identityVisibleQuerySchema = scopeSchoolsQuerySchema.extend({
  orgId: idSchema.optional(),
});
export const scopeSchoolSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  regionName: z.string().min(1),
  allowedActions: z.array(actionSchema),
});
export const scopeSchoolsSchema = paginatedSchema(scopeSchoolSchema);
export const scopeWarningSchema = z.enum([
  "missing_department",
  "unsupported_identity",
  "permission_not_granted",
]);
export const scopeStepSchema = z.strictObject({
  kind: z.enum([
    "boundary",
    "role",
    "department",
    "personal",
    "union",
    "visible",
    "selection",
  ]),
  name: z.string().min(1),
  schoolCount: z.int().nonnegative(),
});
export const scopePreviewSchema = z.strictObject({
  schoolCount: z.int().nonnegative(),
  supported: z.boolean(),
  dataScope: dataScopeSchema.nullable(),
  warnings: z.array(scopeWarningSchema),
  steps: z.array(scopeStepSchema),
});
export const identityVisibleSchema = scopeSchoolsSchema.extend({
  ...scopePreviewSchema.shape,
  identityId: idSchema,
  permission: scopePermissionSchema,
  permissionName: z.string().min(1),
  roles: z.array(
    z.strictObject({
      id: idSchema,
      name: z.string().min(1),
      dataScope: dataScopeSchema,
    }),
  ),
});
const boundary = { orgId: idSchema.optional() };
export const scopePreviewRequestSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("selection"),
    ...boundary,
    scopes: extraScopesSchema,
  }),
  z.strictObject({
    mode: z.literal("identity"),
    ...boundary,
    permission: scopePermissionSchema.default("ops:school:view"),
    roleIds: z
      .array(idSchema)
      .max(100)
      .refine(
        (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
        "角色不能重复",
      ),
    departmentId: idSchema.nullable(),
    scopes: extraScopesSchema,
  }),
]);
export type ScopeSchoolsQuery = z.infer<typeof scopeSchoolsQuerySchema>;
export type IdentityVisibleQuery = z.infer<typeof identityVisibleQuerySchema>;
export type ScopePreviewRequest = z.infer<typeof scopePreviewRequestSchema>;
export type ScopePreview = z.infer<typeof scopePreviewSchema>;

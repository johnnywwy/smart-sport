import { z } from "zod";
import { idSchema } from "./common.js";
import { identityTypeSchema } from "./identities.js";
import { dataScopeSchema } from "./permissions.js";
import { presetFeatureGrantSchema } from "./preset-role-management.js";

export const memberDepartmentOptionSchema = z.strictObject({
  id: idSchema,
  name: z.string(),
  parentId: idSchema.nullable(),
});
/** 仅返回当前人可授予的最终角色，不借用角色管理查询权限。 */
export const assignableMemberRoleSchema = z.strictObject({
  id: idSchema,
  name: z.string(),
  kind: z.enum(["preset", "custom"]),
  identityType: identityTypeSchema,
  dataScope: dataScopeSchema,
  remark: z.string().nullable(),
  grants: z.array(presetFeatureGrantSchema),
});
export const memberOptionsSchema = z.strictObject({
  allowedActions: z.array(z.literal("create")),
  departments: z.array(memberDepartmentOptionSchema),
  roles: z.array(assignableMemberRoleSchema),
});
export type MemberOptions = z.infer<typeof memberOptionsSchema>;
export type MemberDepartmentOption = z.infer<
  typeof memberDepartmentOptionSchema
>;
export type AssignableMemberRole = z.infer<typeof assignableMemberRoleSchema>;

import { z } from "zod";
import { idSchema, versionSchema } from "./common.js";

/** orgId 仅供平台超级管理员指定组织，服务端仍须验证真实角色。 */
export const departmentOrgQuerySchema = z.strictObject({
  orgId: idSchema.optional(),
});
export const departmentParamsSchema = z.strictObject({ id: idSchema });
export const createDepartmentSchema = z.strictObject({
  name: z.string().trim().min(1).max(64),
  parentId: idSchema.nullable().optional(),
});
export const updateDepartmentSchema = z
  .strictObject({
    version: versionSchema,
    name: z.string().trim().min(1).max(64).optional(),
    parentId: idSchema.nullable().optional(),
    sort: z.int().nonnegative().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined || v.parentId !== undefined || v.sort !== undefined,
    {
      message: "请至少修改一个字段",
    },
  );
export const deleteDepartmentSchema = z.strictObject({
  version: versionSchema,
});
export const departmentScopeSummarySchema = z.strictObject({
  type: z.enum(["school", "region", "grade", "college"]),
  count: z.int().nonnegative(),
});
export const departmentSchema = z.strictObject({
  id: idSchema,
  parentId: idSchema.nullable(),
  name: z.string(),
  sort: z.int().nonnegative(),
  isPreset: z.boolean(),
  version: versionSchema,
  /** 直属部门的未删除身份对应的去重账号数，包含停用成员。 */
  memberCount: z.int().nonnegative(),
  scopeSummary: z.array(departmentScopeSummarySchema),
  allowedActions: z.array(z.enum(["create", "update", "delete"])),
});
export type Department = z.infer<typeof departmentSchema>;
export type DepartmentNode = Department & { children: DepartmentNode[] };
export const departmentNodeSchema: z.ZodType<DepartmentNode> =
  departmentSchema.extend({
    children: z.array(z.lazy(() => departmentNodeSchema)),
  });
export const departmentTreeSchema = z.strictObject({
  items: z.array(departmentNodeSchema),
  unassignedMemberCount: z.int().nonnegative(),
});
export type DepartmentOrgQuery = z.infer<typeof departmentOrgQuerySchema>;
export type CreateDepartment = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartment = z.infer<typeof updateDepartmentSchema>;
export type DeleteDepartment = z.infer<typeof deleteDepartmentSchema>;
export type DepartmentTree = z.infer<typeof departmentTreeSchema>;

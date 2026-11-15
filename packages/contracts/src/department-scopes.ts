import { z } from "zod";
import {
  idSchema,
  paginatedSchema,
  paginationQuerySchema,
  versionSchema,
} from "./common.js";
import { departmentOrgQuerySchema } from "./departments.js";
import { extraScopeSchema, extraScopesSchema } from "./identity-scopes.js";
import { regionCodeSchema } from "./regions.js";

export const scopeTypeSchema = z.enum(["school", "region", "grade", "college"]);
const details = {
  name: z.string().min(1),
  /** 已保存范围失效时保留选择值，但使用通用名称，不泄露外边界之外的对象名称。 */
  available: z.boolean(),
  parentValue: regionCodeSchema.nullable(),
};
export const scopeOptionSchema = z.discriminatedUnion("type", [
  extraScopeSchema.options[0].extend(details),
  extraScopeSchema.options[1].extend(details),
  extraScopeSchema.options[2].extend(details),
  extraScopeSchema.options[3].extend(details),
]);
export const setDepartmentScopesSchema = z.strictObject({
  version: versionSchema,
  scopes: extraScopesSchema,
});
export const departmentScopesSchema = z.strictObject({
  departmentId: idSchema,
  version: versionSchema,
  scopes: z.array(scopeOptionSchema),
  /** 当前部门所配置范围展开后的启用学校去重数，不含子部门或成员本人额外负责。 */
  schoolCount: z.int().nonnegative(),
  allowedTypes: z.array(scopeTypeSchema),
  allowedActions: z.array(z.literal("update")),
});
export const scopeOptionsQuerySchema = z
  .strictObject({
    ...departmentOrgQuerySchema.shape,
    ...paginationQuerySchema.shape,
    type: scopeTypeSchema,
    keyword: z.string().trim().max(100).optional(),
    parent: regionCodeSchema.optional(),
  })
  .refine((query) => query.type === "region" || query.parent === undefined, {
    path: ["parent"],
    message: "只有区划选项支持上级筛选",
  });
export const scopeOptionsSchema = paginatedSchema(scopeOptionSchema).extend({
  allowedTypes: z.array(scopeTypeSchema),
});
export type ScopeType = z.infer<typeof scopeTypeSchema>;
export type ScopeOption = z.infer<typeof scopeOptionSchema>;
export type SetDepartmentScopes = z.infer<typeof setDepartmentScopesSchema>;
export type DepartmentScopes = z.infer<typeof departmentScopesSchema>;
export type ScopeOptionsQuery = z.infer<typeof scopeOptionsQuerySchema>;

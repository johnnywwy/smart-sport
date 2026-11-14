import { z } from "zod";
import {
  idSchema,
  paginatedSchema,
  paginationQuerySchema,
  versionSchema,
} from "./common.js";
import { identityTypeSchema } from "./identities.js";

export const memberOrgQuerySchema = z.strictObject({
  orgId: idSchema.optional(),
});
export const memberParamsSchema = z.strictObject({ id: idSchema });
const statusSchema = z.union([z.literal(0), z.literal(1)]);
const roleIdsSchema = z
  .array(idSchema)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, "角色不能重复");
const usernameSchema = z.string().trim().min(1).max(64);
const phoneSchema = z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号");
export const memberListQuerySchema = z.strictObject({
  ...memberOrgQuerySchema.shape,
  ...paginationQuerySchema.shape,
  keyword: z.string().trim().max(100).optional(),
  departmentId: z.union([idSchema, z.literal("unassigned")]).optional(),
  includeDescendants: z
    .union([
      z.boolean(),
      z.enum(["true", "false"]).transform((v) => v === "true"),
    ])
    .default(false),
  identityType: identityTypeSchema.optional(),
  status: z
    .union([statusSchema, z.enum(["0", "1"]).transform(Number)])
    .optional(),
  sort: z
    .enum(["realName:asc", "realName:desc", "createdAt:asc", "createdAt:desc"])
    .default("realName:asc"),
});
export const createMemberSchema = z.strictObject({
  account: z.discriminatedUnion("mode", [
    z.strictObject({
      mode: z.literal("new"),
      username: usernameSchema,
      realName: z.string().trim().min(1).max(64),
      phone: phoneSchema.optional(),
      email: z.email().max(128).optional(),
    }),
    z.strictObject({
      mode: z.literal("existing"),
      account: z.string().trim().min(1).max(128),
    }),
  ]),
  departmentId: idSchema.nullable().default(null),
  roleIds: roleIdsSchema.default([]),
  title: z.string().trim().min(1).max(128).nullable().default(null),
});
export const updateMemberSchema = z
  .strictObject({
    version: versionSchema,
    departmentId: idSchema.nullable().optional(),
    roleIds: roleIdsSchema.optional(),
    title: z.string().trim().min(1).max(128).nullable().optional(),
  })
  .refine(
    (v) =>
      v.departmentId !== undefined ||
      v.roleIds !== undefined ||
      v.title !== undefined,
    "请至少修改一个字段",
  );
export const setMemberStatusSchema = z.strictObject({
  version: versionSchema,
  status: statusSchema,
});
export const memberRoleSchema = z.strictObject({
  id: idSchema,
  name: z.string(),
  kind: z.enum(["preset", "custom"]),
});
export const memberSchema = z.strictObject({
  id: idSchema,
  userId: idSchema,
  orgId: idSchema,
  orgName: z.string(),
  identityType: identityTypeSchema,
  typeName: z.string(),
  username: z.string(),
  realName: z.string(),
  phoneMasked: z.string().nullable(),
  departmentId: idSchema.nullable(),
  departmentName: z.string().nullable(),
  title: z.string().nullable(),
  roles: z.array(memberRoleSchema),
  status: statusSchema,
  accountStatus: statusSchema,
  version: versionSchema,
  allowedActions: z.array(
    z.enum(["update", "assignRoles", "enable", "disable"]),
  ),
});
export const memberListSchema = paginatedSchema(memberSchema);
export const memberDetailSchema = memberSchema.extend({
  otherIdentities: z.array(
    z.strictObject({
      orgName: z.string(),
      typeName: z.string(),
      status: statusSchema,
    }),
  ),
});
export const createMemberResponseSchema = z.strictObject({
  member: memberSchema,
  accountCreated: z.boolean(),
  /** 仅创建新账号时返回；列表、详情、审计均不保存或返回初始密码。 */
  initialPassword: z.string().nullable(),
});
export const memberExamples = {
  create: createMemberSchema.parse({
    account: { mode: "new", username: "member-example", realName: "示例成员" },
  }),
  append: createMemberSchema.parse({
    account: { mode: "existing", account: "member-example" },
  }),
};
export type MemberOrgQuery = z.infer<typeof memberOrgQuerySchema>;
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;
export type CreateMember = z.infer<typeof createMemberSchema>;
export type UpdateMember = z.infer<typeof updateMemberSchema>;
export type SetMemberStatus = z.infer<typeof setMemberStatusSchema>;
export type Member = z.infer<typeof memberSchema>;

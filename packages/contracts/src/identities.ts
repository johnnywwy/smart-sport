import { z } from "zod";
import { idSchema } from "./common.js";
import { organizationTypeSchema } from "./organizations.js";

export const identityTypeSchema = z.enum([
  "company",
  "bureau",
  "agent",
  "school",
  "teacher",
  "student",
  "parent",
]);

export const identityGroupTypeSchema = organizationTypeSchema;

export const identitySummarySchema = z.object({
  id: idSchema,
  type: identityTypeSchema,
  typeName: z.string().min(1),
  orgId: idSchema,
  orgName: z.string().min(1),
  departmentName: z.string().min(1).nullable(),
  title: z.string().min(1).nullable(),
  roleIds: z.array(idSchema),
  lastUsed: z.boolean(),
  available: z.boolean(),
  unavailableReason: z.string().min(1).nullable(),
});

export const identityGroupSchema = z.object({
  type: identityGroupTypeSchema,
  typeName: z.string().min(1),
  items: z.array(identitySummarySchema).min(1),
});

export const identityListSchema = z.object({
  groups: z.array(identityGroupSchema),
  total: z.int().nonnegative(),
  availableCount: z.int().nonnegative(),
});

export const selectIdentityRequestSchema = z.object({
  identityId: idSchema,
});

export const selectIdentityResponseSchema = z.object({
  accessToken: z.string().min(1),
  identity: identitySummarySchema,
});

export type IdentityType = z.infer<typeof identityTypeSchema>;
export const identityTypeNames: Record<IdentityType, string> = {
  company: "公司",
  bureau: "教育局",
  agent: "代理商",
  school: "学校管理员",
  teacher: "教师",
  student: "学生",
  parent: "家长",
};
export type IdentitySummary = z.infer<typeof identitySummarySchema>;
export type IdentityList = z.infer<typeof identityListSchema>;
export type SelectIdentityRequest = z.infer<typeof selectIdentityRequestSchema>;
export type SelectIdentityResponse = z.infer<
  typeof selectIdentityResponseSchema
>;

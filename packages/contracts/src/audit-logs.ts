import { z } from "zod";
import {
  idSchema,
  paginatedSchema,
  paginationQuerySchema,
  timestampSchema,
} from "./common.js";
import { identityTypeSchema } from "./identities.js";

/** 查询范围显式区分；本组织查询不能借用全平台权限。 */
export const auditLogQuerySchema = z
  .strictObject({
    ...paginationQuerySchema.shape,
    scope: z.enum(["organization", "platform"]).default("organization"),
    action: z.string().trim().min(1).max(100).optional(),
    userId: idSchema.optional(),
    operatorName: z.string().trim().min(1).max(100).optional(),
    organizationName: z.string().trim().min(1).max(100).optional(),
    targetType: z.string().trim().min(1).max(100).optional(),
    targetId: idSchema.optional(),
    from: timestampSchema.optional(),
    to: timestampSchema.optional(),
    sort: z.enum(["createdAt:asc", "createdAt:desc"]).default("createdAt:desc"),
  })
  .superRefine((input, context) => {
    if (input.from && input.to && Date.parse(input.from) > Date.parse(input.to))
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "结束时间不能早于开始时间",
      });
    if (input.targetId && !input.targetType)
      context.addIssue({
        code: "custom",
        path: ["targetType"],
        message: "按对象查询时须提供对象类型",
      });
  });

export const auditLogSchema = z.strictObject({
  id: idSchema,
  createdAt: timestampSchema,
  userId: idSchema.nullable(),
  operatorName: z.string().nullable(),
  identityId: idSchema.nullable(),
  identityType: identityTypeSchema.nullable(),
  orgId: idSchema.nullable(),
  organizationName: z.string().nullable(),
  schoolId: idSchema.nullable(),
  schoolName: z.string().nullable(),
  action: z.string().min(1),
  targetType: z.string().nullable(),
  targetId: idSchema.nullable(),
  changes: z.json(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  traceId: z.string().uuid().nullable(),
  allowedActions: z.array(z.never()).max(0),
});
export const auditLogListSchema = paginatedSchema(auditLogSchema);
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;

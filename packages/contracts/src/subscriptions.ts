import { z } from "zod";
import { appRegistry } from "./apps/registry.js";
import {
  dateSchema,
  idSchema,
  paginatedSchema,
  paginationQuerySchema,
  timestampSchema,
  versionSchema,
} from "./common.js";

export const subscriptionStatusSchema = z.enum([
  "trial",
  "active",
  "grace",
  "suspended",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export const schoolAppSourceSchema = z.enum(["contract", "trial", "gift"]);
export const subscriptionParamsSchema = z.strictObject({ schoolId: idSchema });
export const subscriptionQuerySchema = z.strictObject({
  ...paginationQuerySchema.shape,
  status: subscriptionStatusSchema.optional(),
  expiringInDays: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.int().min(0).max(3650))
    .optional(),
  keyword: z.string().trim().min(1).max(128).optional(),
});
export const schoolAppSchema = z.object({
  code: z.enum(
    Object.keys(appRegistry) as [
      keyof typeof appRegistry,
      ...(keyof typeof appRegistry)[],
    ],
  ),
  name: z.string().min(1),
  startDate: dateSchema,
  endDate: dateSchema,
  source: schoolAppSourceSchema,
});
export const subscriptionSchema = z.object({
  id: idSchema,
  schoolId: idSchema,
  schoolName: z.string().min(1),
  no: z.string().min(1),
  contractNo: z.string().nullable(),
  serviceStart: dateSchema,
  serviceEnd: dateSchema,
  graceDays: z.int().min(0).max(365),
  graceEnd: dateSchema,
  status: subscriptionStatusSchema,
  salesIdentityId: idSchema.nullable(),
  salesName: z.string().nullable(),
  version: versionSchema,
  allowedActions: z.array(z.literal("view")),
});
export const subscriptionsSchema = paginatedSchema(subscriptionSchema);
export const subscriptionLogSchema = z.object({
  id: idSchema,
  action: z.enum(["initialize", "status_changed"]),
  previousStatus: subscriptionStatusSchema.nullable(),
  status: subscriptionStatusSchema,
  serviceStart: dateSchema,
  serviceEnd: dateSchema,
  graceDays: z.int().min(0).max(365),
  apps: z.array(schoolAppSchema),
  createdAt: timestampSchema,
});
export const subscriptionDetailSchema = subscriptionSchema.extend({
  apps: z.array(schoolAppSchema),
  history: z.array(subscriptionLogSchema),
});
export const schoolAppsSchema = z.object({
  schoolId: idSchema,
  status: subscriptionStatusSchema,
  serviceEnd: dateSchema.nullable(),
  graceEnd: dateSchema.nullable(),
  accessMode: z.enum(["full", "readonly", "export", "unavailable"]),
  apps: z.array(schoolAppSchema),
});
export type SubscriptionQuery = z.infer<typeof subscriptionQuerySchema>;
export type SchoolApp = z.infer<typeof schoolAppSchema>;
export type Subscription = z.infer<typeof subscriptionSchema>;
export type SubscriptionDetail = z.infer<typeof subscriptionDetailSchema>;
export type SchoolApps = z.infer<typeof schoolAppsSchema>;
export const subscriptionExamples = {
  apps: schoolAppsSchema.parse({
    schoolId: "019a9a40-0000-7000-8000-000000000001",
    status: "grace",
    serviceEnd: "2026-11-19",
    graceEnd: "2026-11-21",
    accessMode: "readonly",
    apps: [
      {
        code: "school",
        name: "学校基础数据",
        startDate: "2026-11-01",
        endDate: "2026-11-19",
        source: "trial",
      },
    ],
  }),
};

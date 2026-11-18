import { z } from "zod";
import { paginatedSchema, paginationQuerySchema } from "./common.js";
import { regionCodeSchema, regionSchema } from "./regions.js";

export const regionManagementQuerySchema = z.strictObject({
  ...paginationQuerySchema.shape,
  parent: regionCodeSchema.optional(),
  keyword: z.string().trim().max(100).optional(),
  sort: z.enum(["name:asc", "name:desc"]).default("name:asc"),
});
export const regionManagementRowSchema = regionSchema.extend({
  parentName: z.string().nullable(),
  schoolCount: z.int().nonnegative(),
  bureaus: z.array(
    z.object({
      name: z.string(),
      status: z.union([z.literal(0), z.literal(1)]),
    }),
  ),
  allowedActions: z.array(z.literal("view")),
});
export const regionManagementListSchema = paginatedSchema(
  regionManagementRowSchema,
).extend({ allowedActions: z.array(z.literal("import")) });
export const regionSyncChangeSchema = z.strictObject({
  code: regionCodeSchema,
  kind: z.enum(["added", "renamed", "retired", "moved"]),
  before: regionSchema.nullable(),
  after: regionSchema.nullable(),
});
export const regionSyncImpactSchema = z.strictObject({
  kind: z.enum(["organization", "department", "identity"]),
  name: z.string(),
  regionName: z.string(),
});
export const regionSyncPreviewSchema = z.strictObject({
  source: z.strictObject({
    version: z.string(),
    reviewedAt: z.string(),
    upstreamCommit: z.string(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  changes: z.array(regionSyncChangeSchema),
  impacts: z.array(regionSyncImpactSchema),
  blocked: z.boolean(),
  allowedActions: z.array(z.literal("import")),
});
export const confirmRegionSyncSchema = z.strictObject({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export const regionSyncResultSchema = z.strictObject({
  applied: z.int().nonnegative(),
});
export type RegionManagementQuery = z.infer<typeof regionManagementQuerySchema>;
export type RegionManagementRow = z.infer<typeof regionManagementRowSchema>;
export type RegionSyncPreview = z.infer<typeof regionSyncPreviewSchema>;
export type RegionSyncChange = z.infer<typeof regionSyncChangeSchema>;

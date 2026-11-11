import { z } from "zod";
import {
  idSchema,
  paginatedSchema,
  paginationQuerySchema,
  versionSchema,
} from "./common.js";
import { regionCodeSchema } from "./regions.js";

export const organizationTypeSchema = z.enum([
  "company",
  "bureau",
  "agent",
  "school",
]);
export const organizationStatusSchema = z.union([z.literal(0), z.literal(1)]);
export const organizationActionSchema = z.enum(["update", "toggle"]);

export const organizationSchema = z.object({
  id: idSchema,
  type: organizationTypeSchema,
  name: z.string().min(1),
  regionCode: regionCodeSchema.nullable(),
  regionName: z.string().min(1).nullable(),
  status: organizationStatusSchema,
  version: versionSchema,
  allowedActions: z.array(organizationActionSchema),
});

const optionalQueryText = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional();

export const organizationListQuerySchema = paginationQuerySchema.extend({
  type: organizationTypeSchema.optional(),
  keyword: optionalQueryText,
  regionCode: regionCodeSchema.optional(),
});

const organizationNameSchema = z.string().trim().min(2).max(128);
export const createOrganizationRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bureau"),
    name: organizationNameSchema,
    regionCode: regionCodeSchema,
  }),
  z.object({
    type: z.literal("agent"),
    name: organizationNameSchema,
    regionCode: regionCodeSchema.nullable().optional(),
  }),
]);

export const updateOrganizationRequestSchema = z.object({
  name: organizationNameSchema,
  regionCode: regionCodeSchema.nullable(),
  version: versionSchema,
});

export const toggleOrganizationRequestSchema = z.object({
  enabled: z.boolean(),
  version: versionSchema,
});

export const organizationParamsSchema = z.object({ id: idSchema });
export const organizationListSchema = paginatedSchema(organizationSchema);

export type Organization = z.infer<typeof organizationSchema>;
export type OrganizationListQuery = z.infer<typeof organizationListQuerySchema>;
export type CreateOrganizationRequest = z.infer<
  typeof createOrganizationRequestSchema
>;
export type UpdateOrganizationRequest = z.infer<
  typeof updateOrganizationRequestSchema
>;
export type ToggleOrganizationRequest = z.infer<
  typeof toggleOrganizationRequestSchema
>;
export type OrganizationParams = z.infer<typeof organizationParamsSchema>;

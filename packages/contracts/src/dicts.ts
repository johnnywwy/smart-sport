import { z } from "zod";
import {
  idSchema,
  paginatedSchema,
  paginationQuerySchema,
  versionSchema,
} from "./common.js";

export const dictTypeCodeSchema = z.enum([
  "gender",
  "ethnicity",
  "stage",
  "grade",
  "document_type",
  "organization_type",
  "identity_type",
]);
export const dictTypeParamsSchema = z.strictObject({
  typeCode: dictTypeCodeSchema,
});
export const dictItemParamsSchema = z.strictObject({ id: idSchema });
export const dictEmptyQuerySchema = z.strictObject({});
const labelSchema = z.string().trim().min(1).max(64);
const descriptionSchema = z.string().trim().max(500);
const sortSchema = z.int().min(0).max(999999);
export const createDictItemSchema = z.strictObject({
  label: labelSchema,
  description: descriptionSchema.default(""),
  sort: sortSchema.default(0),
  enabled: z.boolean().default(true),
});
export const updateDictItemSchema = z.strictObject({
  label: labelSchema,
  description: descriptionSchema,
  sort: sortSchema,
  enabled: z.boolean(),
  version: versionSchema,
});
export const deleteDictItemSchema = z.strictObject({ version: versionSchema });
export const dictItemQuerySchema = paginationQuerySchema
  .extend({
    keyword: z.string().trim().max(64).optional(),
    enabled: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    sort: z
      .enum(["sort:asc", "sort:desc", "label:asc", "label:desc"])
      .default("sort:asc"),
  })
  .strict();
export const dictTypeSchema = z.strictObject({
  code: dictTypeCodeSchema,
  name: labelSchema,
  isSystem: z.literal(true),
  allowCustom: z.boolean(),
  allowedActions: z.array(z.literal("create")),
});
export const dictTypesSchema = z.array(dictTypeSchema);
export const dictItemSchema = z.strictObject({
  id: idSchema,
  typeCode: dictTypeCodeSchema,
  value: z.string().min(1).max(64),
  label: labelSchema,
  description: descriptionSchema,
  sort: sortSchema,
  enabled: z.boolean(),
  isSystem: z.boolean(),
  used: z.boolean(),
  version: versionSchema,
  allowedActions: z.array(z.enum(["update", "delete"])),
});
export const dictItemListSchema = paginatedSchema(dictItemSchema);
export const dictOptionsSchema = z.array(
  z.strictObject({
    value: z.string().min(1).max(64),
    label: labelSchema,
  }),
);
export type DictTypeCode = z.infer<typeof dictTypeCodeSchema>;
export type DictItem = z.infer<typeof dictItemSchema>;
export type DictItemQuery = z.infer<typeof dictItemQuerySchema>;
export type CreateDictItem = z.infer<typeof createDictItemSchema>;
export type UpdateDictItem = z.infer<typeof updateDictItemSchema>;

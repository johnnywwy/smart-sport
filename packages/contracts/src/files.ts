import { z } from "zod";
import { idSchema, timestampSchema } from "./common.js";

/** 20 MiB按20 × 1024 × 1024字节执行；行数由导入解析阶段检查。 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 10_000;
export const fileExtensionSchema = z.enum(["xlsx", "xls"]);
export const fileUploadFieldsSchema = z.strictObject({
  purpose: z.literal("import"),
});
export const fileParamsSchema = z.strictObject({ id: idSchema });
export const schoolFileParamsSchema = z.strictObject({
  schoolId: idSchema,
  id: idSchema,
});
export const schoolFileUploadParamsSchema = z.strictObject({
  schoolId: idSchema,
});
export const storedFileSchema = z.strictObject({
  id: idSchema,
  filename: z.string().min(1).max(255),
  contentType: z.enum([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ]),
  size: z.int().min(1).max(MAX_UPLOAD_BYTES),
  schoolId: idSchema.nullable(),
  purpose: z.literal("import"),
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
  allowedActions: z.array(z.never()).max(0),
});
export const fileDownloadSchema = z.strictObject({
  url: z.url({ protocol: /^https?$/ }),
  expiresAt: timestampSchema,
});
export type StoredFile = z.infer<typeof storedFileSchema>;
export type FileDownload = z.infer<typeof fileDownloadSchema>;

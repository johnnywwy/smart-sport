import type { ExecutionContext } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MAX_UPLOAD_BYTES } from "@smart-sport/contracts";
import type { AuthenticatedRequest } from "../../../core/authenticated.guard.js";

/** 文件体积限制仅用于multipart上传，不提高其他JSON接口的1MiB限制。 */
export const excelUploadInterceptor = FileInterceptor("file", {
  limits: {
    fileSize: MAX_UPLOAD_BYTES + 1,
    files: 1,
    fields: 1,
    parts: 2,
    fieldSize: 32,
    fieldNameSize: 32,
    headerPairs: 64,
    fieldNestingDepth: 1,
  },
  defParamCharset: "utf8",
});
export function fileUploadScope(context: ExecutionContext) {
  const request = context
    .switchToHttp()
    .getRequest<AuthenticatedRequest & { params: { schoolId?: string } }>();
  return request.auth?.identityId
    ? `${request.auth.identityId}:${request.params.schoolId?.toLowerCase() ?? "platform"}`
    : undefined;
}
export const fileMultipartBody = {
  schema: {
    type: "object" as const,
    required: ["file", "purpose"],
    additionalProperties: false,
    properties: {
      file: { type: "string" as const, format: "binary" },
      purpose: { type: "string" as const, enum: ["import"] },
    },
  },
};

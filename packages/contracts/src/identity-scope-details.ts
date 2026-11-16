import { z } from "zod";
import { idSchema, versionSchema } from "./common.js";
import { scopeOptionSchema, scopeTypeSchema } from "./department-scopes.js";
/** 编辑本人额外负责时的名称、失效状态和服务端操作能力，不混同最终可见结果。 */
export const identityScopeDetailsSchema = z.strictObject({
  identityId: idSchema,
  version: versionSchema,
  scopes: z.array(scopeOptionSchema),
  allowedTypes: z.array(scopeTypeSchema),
  allowedActions: z.array(z.literal("update")),
});
export type IdentityScopeDetails = z.infer<typeof identityScopeDetailsSchema>;

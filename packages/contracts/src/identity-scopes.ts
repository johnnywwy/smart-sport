import { z } from "zod";
import { idSchema, versionSchema } from "./common.js";

/** 这里只校验值的格式；存在性、学制与组织外边界必须由服务端另行校验。 */
export const extraScopeSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("school"), value: idSchema }),
  z.strictObject({
    type: z.literal("region"),
    value: z.string().regex(/^[0-9]{6}$/),
  }),
  z.strictObject({
    type: z.literal("grade"),
    value: z.string().regex(/^(1[1-6]|2[1-4]|3[1-3]|4[1-5])$/),
  }),
  z.strictObject({ type: z.literal("college"), value: idSchema }),
]);

export const extraScopesSchema = z
  .array(extraScopeSchema)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      const key = `${item.type}:${item.value}`;
      if (seen.has(key))
        context.addIssue({
          code: "custom",
          path: [index, "value"],
          message: "负责范围不能重复",
        });
      seen.add(key);
    }
  });

export const identityScopeParamsSchema = z.strictObject({ id: idSchema });
/** 整体替换，空数组清空；version 使用目标身份版本。 */
export const setIdentityScopesSchema = z.strictObject({
  version: versionSchema,
  scopes: extraScopesSchema,
});
export const identityScopesSchema = z.strictObject({
  identityId: idSchema,
  version: versionSchema,
  scopes: extraScopesSchema,
});

export type ExtraScope = z.infer<typeof extraScopeSchema>;
export type SetIdentityScopes = z.infer<typeof setIdentityScopesSchema>;
export type IdentityScopes = z.infer<typeof identityScopesSchema>;

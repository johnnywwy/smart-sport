import { z } from "zod";

export const actionSchema = z.enum([
  "view",
  "create",
  "update",
  "delete",
  "import",
  "export",
  "approve",
  "sensitive",
]);
export const dataScopeSchema = z.enum([
  "personal",
  "dept",
  "dept_and_below",
  "all",
]);
export const grantSchema = z.discriminatedUnion("level", [
  z.object({ level: z.enum(["none", "view", "edit", "manage"]) }),
  z.object({ level: z.literal("custom"), actions: z.array(actionSchema) }),
]);
export const featureSchema = z.object({
  app: z.string().regex(/^[a-z][a-z0-9-]*$/),
  feature: z.string().regex(/^[a-z][a-z0-9-]*$/),
  actions: z.array(actionSchema),
});
export type Action = z.infer<typeof actionSchema>;
export type DataScopeOption = z.infer<typeof dataScopeSchema>;
export type FeatureGrant = z.infer<typeof grantSchema>;
export type FeatureDefinition = z.infer<typeof featureSchema>;
export type PermissionCode = `${string}:${string}:${Action}`;

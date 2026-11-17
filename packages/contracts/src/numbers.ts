import { z } from "zod";
import { idSchema, versionSchema } from "./common.js";

/** 系统编号对象由代码声明；管理端只编辑格式，不新增或改写对象类型。 */
export const numberDefinitions = [
  { type: "subscription", name: "学校服务", prefix: "FW" },
  { type: "subscription_request", name: "开通申请", prefix: "KT" },
  { type: "transfer", name: "转学申请", prefix: "ZX" },
  { type: "task", name: "任务", prefix: "RW" },
  { type: "todo", name: "待办", prefix: "DB" },
  { type: "import", name: "导入批次", prefix: "DR" },
] as const;
export const numberTypeSchema = z.enum([
  "subscription",
  "subscription_request",
  "transfer",
  "task",
  "todo",
  "import",
]);
export const numberResetSchema = z.enum(["yearly", "never"]);
export const numberPrefixSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9]{0,11}$/, "前缀须为1至12位大写字母或数字，以字母开头");
export const numberDigitsSchema = z.int().min(1).max(12);
export const numberRuleParamsSchema = z.strictObject({ id: idSchema });
export const numberRuleQuerySchema = z.strictObject({});
export const updateNumberRuleSchema = z.strictObject({
  version: versionSchema,
  prefix: numberPrefixSchema,
  digits: numberDigitsSchema,
  reset: numberResetSchema,
});
export const numberRuleSchema = z.strictObject({
  id: idSchema,
  type: numberTypeSchema,
  name: z.string().min(1),
  prefix: numberPrefixSchema,
  digits: numberDigitsSchema,
  reset: numberResetSchema,
  year: z.int().min(1).max(9999),
  currentValue: z.int().nonnegative().max(999999999999),
  nextNumber: z
    .string()
    .regex(/^[A-Z][A-Z0-9]{0,11}-\d{4}-\d{1,12}$/)
    .nullable(),
  version: versionSchema,
  allowedActions: z.array(z.literal("update")),
});
export const numberRuleListSchema = z.array(numberRuleSchema);
export type NumberType = z.infer<typeof numberTypeSchema>;
export type NumberRule = z.infer<typeof numberRuleSchema>;
export type UpdateNumberRule = z.infer<typeof updateNumberRuleSchema>;

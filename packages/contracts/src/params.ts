import { z } from "zod";
import {
  idSchema,
  paginatedSchema,
  paginationQuerySchema,
  timestampSchema,
  versionSchema,
} from "./common.js";

/** 参数目录归代码所有；数据库保存值与描述，不执行数据库中的校验代码。 */
export const systemParamDefinitions = [
  {
    key: "password.min_length",
    name: "密码最少长度",
    defaultValue: 8,
    min: 8,
    max: 64,
    unit: "位",
    remark: "生产环境新密码的最少长度，仍须同时包含字母和数字。",
  },
  {
    key: "password.expire_days",
    name: "密码有效期",
    defaultValue: 0,
    min: 0,
    max: 365,
    unit: "天",
    remark: "0 表示不过期；非零时在登录时检查，过期须先修改密码。",
  },
  {
    key: "login.lock_threshold",
    name: "登录失败锁定阈值",
    defaultValue: 10,
    min: 5,
    max: 100,
    unit: "次",
    remark: "连续登录失败达到该次数后锁定；锁定功能随 T-022 接入。",
  },
  {
    key: "subscription.trial_days",
    name: "默认试用期",
    defaultValue: 30,
    min: 1,
    max: 365,
    unit: "天",
    remark: "用于后续新开通服务的默认试用期，不改变已有服务期限。",
  },
  {
    key: "subscription.grace_days",
    name: "默认宽限期",
    defaultValue: 30,
    min: 0,
    max: 365,
    unit: "天",
    remark: "0 表示无宽限期；用于后续新服务，不改变已有服务期限。",
  },
  {
    key: "recycle.retention_days",
    name: "回收站保留时间",
    defaultValue: 30,
    min: 1,
    max: 365,
    unit: "天",
    remark: "回收站保留天数，清理任务随回收站模块接入。",
  },
  {
    key: "import.undo_hours",
    name: "导入可撤销时间",
    defaultValue: 24,
    min: 1,
    max: 168,
    unit: "小时",
    remark: "用于后续导入批次的撤销期限，不改变已有截止时间。",
  },
  {
    key: "rollover.undo_days",
    name: "学年升级可撤回时间",
    defaultValue: 7,
    min: 1,
    max: 30,
    unit: "天",
    remark: "用于后续升级的撤回期限，不改变已有截止时间。",
  },
] as const;
export const systemParamKeySchema = z.enum(
  systemParamDefinitions.map((d) => d.key),
);
export type SystemParamKey = z.infer<typeof systemParamKeySchema>;
export function systemParamValueSchema(key: SystemParamKey) {
  const definition = systemParamDefinitions.find((d) => d.key === key);
  if (!definition) throw new Error("未知系统参数");
  return z.int().min(definition.min).max(definition.max);
}
export const updateSystemParamSchema = z.strictObject({
  value: z.int().min(0).max(365),
  version: versionSchema,
  reason: z.string().trim().min(1, "请填写修改原因").max(500),
});
export const systemParamParamsSchema = z.strictObject({ id: idSchema });
export const systemParamEmptyQuerySchema = z.strictObject({});
export const systemParamQuerySchema = z.strictObject({
  ...paginationQuerySchema.shape,
  keyword: z.string().trim().max(100).optional(),
  sort: z
    .enum(["name:asc", "name:desc", "updatedAt:asc", "updatedAt:desc"])
    .default("name:asc"),
});
export const systemParamSchema = z
  .strictObject({
    id: idSchema,
    key: systemParamKeySchema,
    name: z.string().min(1),
    value: z.int(),
    defaultValue: z.int(),
    min: z.int(),
    max: z.int(),
    unit: z.string().min(1),
    remark: z.string(),
    updatedAt: timestampSchema,
    version: versionSchema,
    allowedActions: z.array(z.literal("update")),
  })
  .superRefine((row, context) => {
    if (!systemParamValueSchema(row.key).safeParse(row.value).success)
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "参数值不在允许范围内",
      });
  });
export const systemParamListSchema = paginatedSchema(systemParamSchema);
export type SystemParam = z.infer<typeof systemParamSchema>;
export type SystemParamQuery = z.infer<typeof systemParamQuerySchema>;
export type UpdateSystemParam = z.infer<typeof updateSystemParamSchema>;

import { type SystemParam, systemParamSchema } from "./params.js";
export const systemParamExample: SystemParam = systemParamSchema.parse({
  id: "01932b9d-8000-7000-8000-000000000116",
  key: "password.min_length",
  name: "密码最少长度",
  value: 8,
  defaultValue: 8,
  min: 8,
  max: 64,
  unit: "位",
  remark: "生产环境新密码的最少长度。",
  updatedAt: "2026-11-17T00:00:00.000Z",
  version: 0,
  allowedActions: ["update"],
});

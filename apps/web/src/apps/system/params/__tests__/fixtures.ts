import {
  systemParamDefinitions,
  systemParamSchema,
} from "@smart-sport/contracts";
export const paramRows = systemParamDefinitions.map((d, index) =>
  systemParamSchema.parse({
    id: `01932b9d-8000-7000-8000-${String(index + 1).padStart(12, "0")}`,
    key: d.key,
    name: d.name,
    value: d.defaultValue,
    defaultValue: d.defaultValue,
    min: d.min,
    max: d.max,
    unit: d.unit,
    remark: d.remark,
    updatedAt: "2026-11-17T00:00:00.000Z",
    version: 0,
    allowedActions: ["update"],
  }),
);
export const paramExample = paramRows.find(
  (row) => row.key === "password.min_length",
);
if (!paramExample) throw new Error("缺少密码参数示例");

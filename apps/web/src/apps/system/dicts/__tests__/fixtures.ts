import { dictItemSchema, dictTypesSchema } from "@smart-sport/contracts";
export const dictItemExample = dictItemSchema.parse({
  id: "019a87ce-7000-7000-8000-000000000001",
  typeCode: "document_type",
  value: "resident_id",
  label: "居民身份证",
  description: "",
  sort: 1,
  enabled: true,
  isSystem: true,
  used: false,
  version: 0,
  allowedActions: [],
});
export const customDictItem = dictItemSchema.parse({
  ...dictItemExample,
  id: "019a87ce-7000-7000-8000-000000000002",
  value: "custom_example",
  label: "自定义证件",
  isSystem: false,
  allowedActions: ["update", "delete"],
});
export const dictTypesExample = dictTypesSchema.parse([
  {
    code: "gender",
    name: "性别",
    isSystem: true,
    allowCustom: false,
    allowedActions: [],
  },
  {
    code: "stage",
    name: "学段",
    isSystem: true,
    allowCustom: false,
    allowedActions: [],
  },
  {
    code: "document_type",
    name: "证件类型",
    isSystem: true,
    allowCustom: true,
    allowedActions: ["create"],
  },
]);

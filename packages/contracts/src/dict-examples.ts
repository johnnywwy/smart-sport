import { dictItemSchema, dictOptionsSchema, dictTypesSchema } from "./dicts.js";
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
export const dictTypesExample = dictTypesSchema.parse([
  {
    code: "document_type",
    name: "证件类型",
    isSystem: true,
    allowCustom: true,
    allowedActions: ["create"],
  },
]);
export const dictOptionsExample = dictOptionsSchema.parse([
  { value: "resident_id", label: "居民身份证" },
]);

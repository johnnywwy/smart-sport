import {
  departmentScopesSchema,
  scopeOptionsSchema,
  setDepartmentScopesSchema,
} from "./department-scopes.js";

export const setDepartmentScopesExample = setDepartmentScopesSchema.parse({
  version: 0,
  scopes: [{ type: "region", value: "330000" }],
});
export const departmentScopesExample = departmentScopesSchema.parse({
  departmentId: "019c1472-9e57-7000-8000-000000000001",
  version: 1,
  scopes: [
    {
      type: "region",
      value: "330000",
      name: "浙江省",
      available: true,
      parentValue: null,
    },
  ],
  schoolCount: 12,
  allowedTypes: ["school", "region"],
  allowedActions: ["update"],
});
export const scopeOptionsExample = scopeOptionsSchema.parse({
  items: departmentScopesExample.scopes,
  total: 1,
  page: 1,
  pageSize: 20,
  allowedTypes: ["school", "region"],
});

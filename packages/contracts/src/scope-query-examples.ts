import {
  identityVisibleSchema,
  scopePreviewRequestSchema,
  scopePreviewSchema,
  scopeSchoolsSchema,
} from "./scope-queries.js";
export const scopeSchoolListExample = scopeSchoolsSchema.parse({
  items: [
    {
      id: "019c1472-9e57-7000-8000-000000000001",
      name: "示例小学",
      regionName: "西湖区",
      allowedActions: ["view"],
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
});
export const scopePreviewRequestExample = scopePreviewRequestSchema.parse({
  mode: "selection",
  scopes: [{ type: "region", value: "330000" }],
});
export const scopePreviewExample = scopePreviewSchema.parse({
  schoolCount: 1,
  supported: true,
  dataScope: null,
  warnings: [],
  steps: [
    {
      kind: "selection",
      name: "所选范围与组织外边界相交后的去重学校",
      schoolCount: 1,
    },
  ],
});
export const identityVisibleExample = identityVisibleSchema.parse({
  ...scopeSchoolListExample,
  ...scopePreviewExample,
  identityId: "019c1472-9e57-7000-8000-000000000002",
  permission: "ops:school:view",
  permissionName: "学校管理 · 查看",
  roles: [],
});

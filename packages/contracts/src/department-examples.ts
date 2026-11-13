import { departmentTreeSchema } from "./departments.js";

export const departmentTreeExample = departmentTreeSchema.parse({
  items: [
    {
      id: "019c1472-9e57-7000-8000-000000000001",
      parentId: null,
      name: "研发部",
      sort: 0,
      isPreset: true,
      version: 0,
      memberCount: 2,
      scopeSummary: [],
      allowedActions: ["create", "update"],
      children: [
        {
          id: "019c1472-9e57-7000-8000-000000000002",
          parentId: "019c1472-9e57-7000-8000-000000000001",
          name: "平台组",
          sort: 0,
          isPreset: false,
          version: 1,
          memberCount: 1,
          scopeSummary: [{ type: "region", count: 1 }],
          allowedActions: ["create", "update"],
          children: [],
        },
      ],
    },
  ],
  unassignedMemberCount: 1,
});

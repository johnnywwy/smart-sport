import type { IdentityList } from "@smart-sport/contracts";
import { describe, expect, it } from "vitest";
import { filterIdentityGroups } from "./identity-filter";

const identities: IdentityList = {
  total: 2,
  availableCount: 2,
  groups: [
    {
      type: "company",
      typeName: "公司",
      items: [
        {
          id: "019a0000-0000-7000-8000-000000000001",
          type: "company",
          typeName: "公司员工",
          orgId: "019a0000-0000-7000-8000-000000000002",
          orgName: "智体科技",
          departmentName: "研发部",
          title: "研发人员",
          roleIds: [],
          lastUsed: true,
          available: true,
          unavailableReason: null,
        },
      ],
    },
    {
      type: "school",
      typeName: "学校",
      items: [
        {
          id: "019a0000-0000-7000-8000-000000000003",
          type: "teacher",
          typeName: "教师",
          orgId: "019a0000-0000-7000-8000-000000000004",
          orgName: "西湖第一小学",
          departmentName: null,
          title: "体育教师",
          roleIds: [],
          lastUsed: false,
          available: true,
          unavailableReason: null,
        },
      ],
    },
  ],
};

describe("身份搜索", () => {
  it.each(["智体", "公司员工", "研发部", "研发人员"])(
    "可按组织及身份信息筛选：%s",
    (query) => {
      expect(filterIdentityGroups(identities.groups, query)).toHaveLength(1);
      expect(filterIdentityGroups(identities.groups, query)[0]?.type).toBe(
        "company",
      );
    },
  );

  it("忽略首尾空格，并移除空分组", () => {
    const result = filterIdentityGroups(identities.groups, "  西湖  ");
    expect(result).toHaveLength(1);
    expect(result[0]?.items[0]?.orgName).toBe("西湖第一小学");
  });
});

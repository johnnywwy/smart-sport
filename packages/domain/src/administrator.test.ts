import { describe, expect, it } from "vitest";
import type { FeatureGrantEntry } from "./permissions.js";
import { isOrganizationAdministrator } from "./permissions.js";

describe("组织管理员的最终权限", () => {
  const member: FeatureGrantEntry = {
    app: "org",
    feature: "member",
    grant: { level: "manage" },
  };
  const role: FeatureGrantEntry = {
    app: "org",
    feature: "role",
    grant: { level: "manage" },
  };
  it("必须同时有成员和角色的完整管理能力，编辑或只读不算管理员", () => {
    expect(isOrganizationAdministrator([member, role])).toBe(true);
    expect(isOrganizationAdministrator([member])).toBe(false);
    expect(isOrganizationAdministrator([role])).toBe(false);
    expect(
      isOrganizationAdministrator([
        member,
        { ...role, grant: { level: "edit" } },
      ]),
    ).toBe(false);
    expect(isOrganizationAdministrator([])).toBe(false);
  });
  it("同一身份多个角色的自定义动作可以合并成完整管理能力", () => {
    expect(
      isOrganizationAdministrator([
        role,
        { ...member, grant: { level: "edit" } },
        {
          ...member,
          grant: { level: "custom", actions: ["delete", "import", "export"] },
        },
      ]),
    ).toBe(true);
  });
  it("其他应用的管理权限与缺少一个动作的自定义档均不能冒充管理员", () => {
    expect(
      isOrganizationAdministrator([member, { ...role, app: "school" }]),
    ).toBe(false);
    expect(
      isOrganizationAdministrator([
        role,
        {
          ...member,
          grant: {
            level: "custom",
            actions: ["view", "create", "update", "delete", "export"],
          },
        },
      ]),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  grantsFitIdentity,
  organizationIdentityTypes,
  withinRoleCeiling,
} from "../../src/modules/platform/role-management/role-policy.js";

describe("自定义角色权限上限", () => {
  it("逐权限码比较范围，不能借查看权限的全部范围扩大编辑范围", () => {
    const actor = new Map([
      ["school:student:view", "all" as const],
      ["school:student:update", "dept" as const],
    ]);
    const grants = [
      {
        app: "school",
        feature: "student",
        grant: {
          level: "custom" as const,
          actions: ["view" as const, "update" as const],
        },
      },
    ];
    expect(withinRoleCeiling(grants, "dept", actor)).toBe(true);
    expect(withinRoleCeiling(grants, "all", actor)).toBe(false);
    expect(
      withinRoleCeiling(
        [
          {
            app: "school",
            feature: "student",
            grant: { level: "manage" },
          },
        ],
        "personal",
        actor,
      ),
    ).toBe(false);
  });
  it("无授权的角色也不能设置比操作人更宽的数据范围", () => {
    const actor = new Map([["org:role:create", "personal" as const]]);
    expect(withinRoleCeiling([], "personal", actor)).toBe(true);
    expect(withinRoleCeiling([], "all", actor)).toBe(false);
  });
  it("仅学校组织可以同时管理学校和教师身份，不向不适用身份授予功能", () => {
    expect(organizationIdentityTypes("school")).toEqual(["school", "teacher"]);
    expect(organizationIdentityTypes("company")).toEqual(["company"]);
    expect(
      grantsFitIdentity(
        [
          {
            app: "system",
            feature: "param",
            grant: { level: "view" },
          },
        ],
        "teacher",
      ),
    ).toBe(false);
    expect(
      grantsFitIdentity(
        [
          {
            app: "system",
            feature: "param",
            grant: { level: "none" },
          },
        ],
        "teacher",
      ),
    ).toBe(true);
  });
});

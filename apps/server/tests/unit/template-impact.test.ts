import type { PresetFeatureGrant } from "@smart-sport/contracts";
import { describe, expect, it } from "vitest";
import { templateMenuChanges } from "../../src/modules/platform/preset-roles/template-impact.js";

const before: PresetFeatureGrant[] = [
  { app: "school", feature: "class", grant: { level: "manage" } },
  { app: "school", feature: "teaching-class", grant: { level: "manage" } },
  { app: "school", feature: "college", grant: { level: "manage" } },
];
const roles = [{ id: "test-role", name: "学校管理员", kind: "preset" }];

describe("院系专业独立菜单的模板影响预览", () => {
  it("撤销院系查询权限只移除院系专业菜单，班级管理仍保留", () => {
    const after = before.map((entry) =>
      entry.feature === "college"
        ? { ...entry, grant: { level: "none" as const } }
        : entry,
    );
    expect(
      templateMenuChanges("school", before, after, roles, new Map()),
    ).toEqual([
      {
        roleId: "test-role",
        roleName: "学校管理员",
        added: [],
        removed: [{ module: "基础信息", name: "院系专业" }],
      },
    ]);
  });

  it("撤销两类班级查询权限只移除班级管理，院系专业仍保留", () => {
    const after = before.map((entry) =>
      entry.feature !== "college"
        ? { ...entry, grant: { level: "none" as const } }
        : entry,
    );
    expect(
      templateMenuChanges("school", before, after, roles, new Map()),
    ).toEqual([
      {
        roleId: "test-role",
        roleName: "学校管理员",
        added: [],
        removed: [{ module: "基础信息", name: "班级管理" }],
      },
    ]);
  });
});

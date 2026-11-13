import {
  type DepartmentNode,
  departmentSchema,
  departmentTreeSchema,
} from "@smart-sport/contracts";
import { describe, expect, it } from "vitest";
import {
  canMoveDepartment,
  departmentPath,
  departmentPermissions,
  excludedParents,
  flattenDepartments,
} from "./department-state";

const ids = [1, 2, 3, 4].map(
  (n) => `019c1472-9e57-7000-8000-${String(n).padStart(12, "0")}`,
);
const row = (
  i: number,
  parentId: string | null,
  children: DepartmentNode[] = [],
): DepartmentNode => ({
  ...departmentSchema.parse({
    id: ids[i],
    name: ["研发部", "平台组", "前端组", "销售部"][i],
    parentId,
    sort: 0,
    isPreset: false,
    version: 0,
    memberCount: 0,
    scopeSummary: [],
    allowedActions: ["create", "update", "delete"],
  }),
  children,
});
const nested = row(0, null, [row(1, ids[0] ?? null, [row(2, ids[1] ?? null)])]);
const items = [nested, row(3, null)];
describe("部门树交互状态", () => {
  it("保持树顺序并生成完整组织位置，界面不暴露系统ID", () => {
    expect(flattenDepartments(items).map((item) => item.name)).toEqual([
      "研发部",
      "平台组",
      "前端组",
      "销售部",
    ]);
    expect(departmentPath(items, ids[2] ?? null, "智慧体育云平台")).toBe(
      "智慧体育云平台 / 研发部 / 平台组 / 前端组",
    );
    expect(departmentPath(items, null, "智慧体育云平台")).toBe(
      "智慧体育云平台",
    );
  });
  it("编辑的上级选择排除自身和所有后代，同时保留兄弟分支", () => {
    expect([...excludedParents(items, ids[0])]).toEqual(ids.slice(0, 3));
    expect(excludedParents(items)).toEqual(new Set());
    expect(excludedParents(items, ids[1]).has(ids[3] ?? "")).toBe(false);
  });
  it("拖动拒绝自身、后代、原上级和无效目标，可移动到另一分支或根", () => {
    expect(canMoveDepartment(items, nested, ids[0] ?? null)).toBe(false);
    expect(canMoveDepartment(items, nested, ids[2] ?? null)).toBe(false);
    expect(canMoveDepartment(items, nested, null)).toBe(false);
    expect(canMoveDepartment(items, nested, "unknown")).toBe(false);
    expect(canMoveDepartment(items, nested, ids[3] ?? null)).toBe(true);
    const child = nested.children[0];
    if (!child) throw new Error("缺少子节点");
    expect(canMoveDepartment(items, child, null)).toBe(true);
    expect(
      canMoveDepartment(items, { ...child, allowedActions: [] }, null),
    ).toBe(false);
  });
  it("空树创建入口使用服务端能力，查询可见不能推断有新建权限", () => {
    const empty = departmentTreeSchema.parse({
      items: [],
      unassignedMemberCount: 1,
      allowedActions: [],
    });
    expect(departmentPermissions(empty)).toEqual([]);
    expect(
      departmentPermissions({ ...empty, allowedActions: ["create"] }),
    ).toEqual(["org:department:create"]);
    expect(departmentPermissions(undefined)).toEqual([]);
  });
});

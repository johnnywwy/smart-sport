import type { Department, DepartmentNode } from "@smart-sport/contracts";
import { describe, expect, it } from "vitest";
import { departmentTree } from "../../src/modules/platform/departments/departments.mapper.js";

describe("部门树组装", () => {
  const node = (id: string, parentId: string | null): Department => ({
    id,
    parentId,
    name: id,
    sort: 0,
    isPreset: false,
    version: 0,
    memberCount: 0,
    scopeSummary: [],
    allowedActions: [],
  });
  it("与输入父子先后无关，保留同级排序且不修改输入", () => {
    const input = [
      node("child-1", "parent"),
      node("child-2", "parent"),
      node("parent", null),
      node("root-2", null),
    ];
    const before = structuredClone(input);
    const result = departmentTree(input);
    expect(result.map((row) => row.id)).toEqual(["parent", "root-2"]);
    expect(result[0]?.children.map((row) => row.id)).toEqual([
      "child-1",
      "child-2",
    ]);
    expect(input).toEqual(before);
  });
  it("不引入业务深度限制，深层数据组装不会递归溢出", () => {
    const input = Array.from({ length: 10000 }, (_, i) =>
      node(String(i), i ? String(i - 1) : null),
    );
    let current: DepartmentNode | undefined = departmentTree(input)[0];
    let count = 0;
    while (current) {
      count++;
      current = current.children[0];
    }
    expect(count).toBe(10000);
  });
});

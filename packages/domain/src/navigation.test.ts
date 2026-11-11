import { describe, expect, it } from "vitest";
import { buildMenuTree, type FlatMenu } from "./navigation.js";

const menu = (key: string, parentKey: string | null, sort = 0): FlatMenu => ({
  key,
  parentKey,
  sort,
  name: key,
  path: `/${key}`,
  icon: null,
});
describe("可见菜单树", () => {
  it("按父子关系和稳定顺序构树，不修改输入", () => {
    const input = [
      menu("child", "parent"),
      menu("last", null, 10),
      menu("parent", null),
      menu("first", null),
    ];
    const tree = buildMenuTree(input);
    expect(tree.map(({ key }) => key)).toEqual(["first", "parent", "last"]);
    expect(tree[1]?.children.map(({ key }) => key)).toEqual(["child"]);
    expect(input.map(({ key }) => key)).toEqual([
      "child",
      "last",
      "parent",
      "first",
    ]);
  });
  it("父菜单被过滤后，其后代也不暴露", () => {
    expect(
      buildMenuTree([menu("child", "hidden"), menu("grandchild", "child")]),
    ).toEqual([]);
  });
  it("循环父子关系不会形成无限递归或孤立菜单", () => {
    expect(
      buildMenuTree([menu("a", "b"), menu("b", "a"), menu("self", "self")]),
    ).toEqual([]);
  });
});

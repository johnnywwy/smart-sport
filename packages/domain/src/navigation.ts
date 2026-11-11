import type { MenuNode } from "@smart-sport/contracts";

export type FlatMenu = Omit<MenuNode, "children"> & {
  parentKey: string | null;
};

/** 仅连接仍可见的父节点；隐藏父菜单后不把子菜单提升到根层。 */
export function buildMenuTree(items: readonly FlatMenu[]): MenuNode[] {
  const children = new Map<string | null, FlatMenu[]>();
  for (const item of items) {
    const siblings = children.get(item.parentKey) ?? [];
    siblings.push(item);
    children.set(item.parentKey, siblings);
  }
  const branch = (
    parentKey: string | null,
    ancestors: ReadonlySet<string>,
  ): MenuNode[] =>
    (children.get(parentKey) ?? [])
      .filter(({ key }) => !ancestors.has(key))
      .sort(
        (left, right) =>
          left.sort - right.sort || left.key.localeCompare(right.key),
      )
      .map(({ parentKey: _parent, ...item }) => ({
        ...item,
        children: branch(item.key, new Set([...ancestors, item.key])),
      }));
  return branch(null, new Set());
}

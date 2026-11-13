import type { Department, DepartmentNode } from "@smart-sport/contracts";
import type { IdentityContext } from "../identity-context/index.js";
import type { DepartmentRow } from "./departments.repository.js";

export function departmentContract(
  row: DepartmentRow,
  actor: IdentityContext,
  memberCount = 0,
  hasChildren = false,
  scopeSummary: Department["scopeSummary"] = [],
): Department {
  const allowedActions: Department["allowedActions"] = [];
  if (actor.permissions.has("org:department:create"))
    allowedActions.push("create");
  if (actor.permissions.has("org:department:update"))
    allowedActions.push("update");
  if (
    actor.permissions.has("org:department:delete") &&
    !row.isPreset &&
    !memberCount &&
    !hasChildren
  )
    allowedActions.push("delete");
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    sort: row.sort,
    isPreset: row.isPreset,
    version: row.version,
    memberCount,
    scopeSummary,
    allowedActions,
  };
}

/** 迭代组装，部门层级不受递归函数调用栈限制。 */
export function departmentTree(items: Department[]): DepartmentNode[] {
  const nodes = new Map(
    items.map((item) => [item.id, { ...item, children: [] } as DepartmentNode]),
  );
  const roots: DepartmentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

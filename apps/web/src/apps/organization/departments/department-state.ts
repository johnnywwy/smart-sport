import type {
  Department,
  DepartmentNode,
  DepartmentTree,
  PermissionCode,
} from "@smart-sport/contracts";

export const organizationRoot = "organization-root";
export const unassignedDepartment = "unassigned";
export function flattenDepartments(
  items: readonly DepartmentNode[],
): DepartmentNode[] {
  const result: DepartmentNode[] = [];
  const stack = [...items].reverse();
  while (stack.length) {
    const row = stack.pop();
    if (!row) continue;
    result.push(row);
    stack.push(...[...row.children].reverse());
  }
  return result;
}
export function departmentPath(
  items: readonly DepartmentNode[],
  id: string | null,
  orgName: string,
) {
  const map = new Map(flattenDepartments(items).map((row) => [row.id, row]));
  const names: string[] = [];
  const visited = new Set<string>();
  let current = id ? map.get(id) : undefined;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? map.get(current.parentId) : undefined;
  }
  return [orgName, ...names].join(" / ");
}
export function excludedParents(items: readonly DepartmentNode[], id?: string) {
  const row = flattenDepartments(items).find((item) => item.id === id);
  return new Set(row ? flattenDepartments([row]).map((item) => item.id) : []);
}
export function canMoveDepartment(
  items: readonly DepartmentNode[],
  row: Department,
  parentId: string | null,
) {
  return (
    row.allowedActions.includes("update") &&
    row.parentId !== parentId &&
    (parentId === null ||
      (flattenDepartments(items).some((item) => item.id === parentId) &&
        !excludedParents(items, row.id).has(parentId)))
  );
}
export function departmentPermissions(
  tree: DepartmentTree | undefined,
): PermissionCode[] {
  return tree?.allowedActions.includes("create")
    ? ["org:department:create"]
    : [];
}

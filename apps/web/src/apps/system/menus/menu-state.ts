import {
  type MenuOverride,
  type MenuOverrideChange,
  type MenuOverrideFields,
  type ModuleCode,
  menuOverrideFieldsSchema,
} from "@smart-sport/contracts";
import type { TableQuery } from "../../../shared/components/data-table/types";
export const initialMenuQuery: TableQuery = {
  page: 1,
  pageSize: 20,
  keyword: "",
  filters: {},
  deleted: false,
};
export const menuFormSchema = menuOverrideFieldsSchema;
export function menuValues(row: MenuOverride): MenuOverrideFields {
  return {
    displayName: row.displayName,
    sort: row.sort,
    hidden: row.hidden,
    version: row.version,
  };
}
export function menuChange(
  row: MenuOverride,
  values = menuValues(row),
): MenuOverrideChange {
  return { module: row.module, key: row.key, ...values };
}
export function menuQueryString(module: ModuleCode, query: TableQuery) {
  return new URLSearchParams({
    module,
    page: String(query.page),
    pageSize: String(query.pageSize),
    ...(query.keyword.trim() ? { keyword: query.keyword.trim() } : {}),
  }).toString();
}
export function reorderedMenus(
  rows: readonly MenuOverride[],
  source: MenuOverride,
  target: MenuOverride,
  position: "before" | "after",
): MenuOverrideChange[] {
  if (
    source.id === target.id ||
    source.module !== target.module ||
    source.groupKey !== target.groupKey
  )
    return [];
  const group = rows
    .filter(
      (item) =>
        item.module === source.module && item.groupKey === source.groupKey,
    )
    .sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key));
  const from = group.findIndex((row) => row.id === source.id);
  if (from < 0) return [];
  const item = group.splice(from, 1)[0];
  if (!item) return [];
  const to = group.findIndex((row) => row.id === target.id);
  if (to < 0) return [];
  group.splice(to + (position === "after" ? 1 : 0), 0, item);
  const original = rows
    .filter(
      (row) => row.module === source.module && row.groupKey === source.groupKey,
    )
    .sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key));
  if (group.every((row, index) => row.id === original[index]?.id)) return [];
  return group.map((item, index) =>
    menuChange(item, { ...menuValues(item), sort: (index + 1) * 10 }),
  );
}

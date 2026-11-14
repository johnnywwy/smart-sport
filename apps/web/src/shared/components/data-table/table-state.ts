import type { TableColumn, TableQuery, TableRecord } from "./types";

export function changeTableQuery(
  query: TableQuery,
  patch: Partial<TableQuery>,
): TableQuery {
  return { ...query, ...patch, page: patch.page ?? 1 };
}

export function tableSortParameter(sort: TableQuery["sort"]) {
  return sort
    ? `${sort.column}:${sort.direction === "ascending" ? "asc" : "desc"}`
    : undefined;
}

export function selectedDeletableRows<T extends TableRecord>(
  items: readonly T[],
  selectedKeys: ReadonlySet<string>,
) {
  return items.filter(
    (item) =>
      selectedKeys.has(item.id) && item.allowedActions.includes("delete"),
  );
}

export function visibleTableColumns<T>(
  columns: readonly TableColumn<T>[],
  selectedKeys: ReadonlySet<string>,
) {
  // 首列是行标题，始终保留，以保证键盘和读屏导航可用。
  return columns.filter(
    (column, index) =>
      index === 0 || column.required || selectedKeys.has(column.id),
  );
}

export function tablePageNumbers(page: number, pages: number) {
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  return Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);
}

export function selectedActionableRows<T extends TableRecord>(
  items: readonly T[],
  keys: ReadonlySet<string>,
  actions: readonly string[],
) {
  return items.filter(
    (item) =>
      keys.has(item.id) &&
      actions.some((action) => item.allowedActions.includes(action)),
  );
}

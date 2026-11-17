import type { NumberRule } from "@smart-sport/contracts";
import type { TableQuery } from "../../../shared/components/data-table/types";

export const initialNumberQuery: TableQuery = {
  page: 1,
  pageSize: 20,
  keyword: "",
  filters: {},
  deleted: false,
};
export const resetLabels = { yearly: "每年", never: "不重置" } as const;
export function numberRuleValues(row: NumberRule) {
  return { prefix: row.prefix, digits: row.digits, reset: row.reset };
}
export function numberTablePage(rows: NumberRule[], query: TableQuery) {
  const keyword = query.keyword.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      (!query.filters.object || query.filters.object === row.type) &&
      (!keyword ||
        `${row.name} ${row.prefix} ${row.nextNumber ?? ""}`
          .toLowerCase()
          .includes(keyword)),
  );
  if (query.sort?.column === "name") {
    const direction = query.sort.direction === "ascending" ? 1 : -1;
    filtered.sort((a, b) => direction * a.name.localeCompare(b.name, "zh-CN"));
  }
  const page = Math.min(
    query.page,
    Math.max(1, Math.ceil(filtered.length / query.pageSize)),
  );
  return {
    items: filtered.slice((page - 1) * query.pageSize, page * query.pageSize),
    total: filtered.length,
    page,
    pageSize: query.pageSize,
  };
}

import {
  type DictItem,
  type DictTypeCode,
  dictItemQuerySchema,
  type dictTypesSchema,
} from "@smart-sport/contracts";
import type { TableQuery } from "../../../shared/components/data-table/types";
export type DictType = ReturnType<typeof dictTypesSchema.parse>[number];
export const initialDictQuery: TableQuery = {
  page: 1,
  pageSize: 20,
  keyword: "",
  filters: {},
  deleted: false,
};
export function dictRequestQuery(query: TableQuery) {
  const direction = query.sort?.direction === "descending" ? "desc" : "asc";
  const field = query.sort?.column === "label" ? "label" : "sort";
  return {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.keyword.trim() ? { keyword: query.keyword.trim() } : {}),
    ...(["true", "false"].includes(query.filters.enabled ?? "")
      ? { enabled: query.filters.enabled }
      : {}),
    sort: `${field}:${direction}`,
  };
}
export function dictQueryString(query: TableQuery) {
  const raw = dictRequestQuery(query);
  dictItemQuerySchema.parse(raw);
  return new URLSearchParams(
    Object.entries(raw).map(([key, value]) => [key, String(value)]),
  ).toString();
}
export function selectedDictType(
  types: readonly DictType[],
  code: DictTypeCode | undefined,
) {
  return (
    types.find((t) => t.code === code) ??
    types.find((t) => t.code === "stage") ??
    types[0]
  );
}
export function dictItemValues(row?: DictItem) {
  return {
    label: row?.label ?? "",
    description: row?.description ?? "",
    sort: row?.sort ?? 0,
    enabled: row?.enabled ?? true,
  };
}

/** 与设计稿一致优先展示学段；未画出的已声明字典继续保留。 */
export function orderDictTypes(types: readonly DictType[]) {
  const order: DictTypeCode[] = [
    "stage",
    "gender",
    "ethnicity",
    "document_type",
    "grade",
    "organization_type",
    "identity_type",
  ];
  return [...types].sort(
    (a, b) => order.indexOf(a.code) - order.indexOf(b.code),
  );
}

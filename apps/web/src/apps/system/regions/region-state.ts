import {
  type RegionManagementRow,
  regionManagementQuerySchema,
} from "@smart-sport/contracts";
import type { TableQuery } from "../../../shared/components/data-table/types";
export const initialRegionQuery: TableQuery = {
  page: 1,
  pageSize: 20,
  keyword: "",
  filters: {},
  deleted: false,
};
export function regionQueryString(query: TableQuery, parent?: string) {
  const input = regionManagementQuerySchema.parse({
    page: query.page,
    pageSize: query.pageSize,
    ...(parent ? { parent } : {}),
    ...(query.keyword.trim() ? { keyword: query.keyword.trim() } : {}),
    sort: query.sort?.direction === "descending" ? "name:desc" : "name:asc",
  });
  return new URLSearchParams(
    Object.entries(input).map(([k, v]) => [k, String(v)]),
  ).toString();
}
export const regionLevelName = (level: RegionManagementRow["level"]) =>
  ({ 1: "省", 2: "市", 3: "区县" })[level];
export const bureauLabel = (row: RegionManagementRow) =>
  row.bureaus
    .map((b) => `${b.name}${b.status === 0 ? "（已停用）" : ""}`)
    .join("、") || "未关联";

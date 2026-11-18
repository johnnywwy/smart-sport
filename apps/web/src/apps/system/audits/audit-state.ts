import {
  type AuditLogQuery,
  auditLogQuerySchema,
  dateSchema,
} from "@smart-sport/contracts";
import type { TableQuery } from "../../../shared/components/data-table/types";
export type AuditScope = AuditLogQuery["scope"];
export const initialAuditQuery: TableQuery = {
  page: 1,
  pageSize: 20,
  keyword: "",
  filters: {},
  deleted: false,
  sort: { column: "createdAt", direction: "descending" },
};
export function auditQueryString(scope: AuditScope, query: TableQuery) {
  const input = auditLogQuerySchema.parse({
    scope,
    page: query.page,
    pageSize: query.pageSize,
    sort:
      query.sort?.direction === "ascending"
        ? "createdAt:asc"
        : "createdAt:desc",
    ...(query.filters.action ? { action: query.filters.action } : {}),
    ...(query.filters.userId ? { userId: query.filters.userId } : {}),
    ...(query.filters.from
      ? { from: `${dateSchema.parse(query.filters.from)}T00:00:00+08:00` }
      : {}),
    ...(query.filters.to
      ? { to: `${dateSchema.parse(query.filters.to)}T23:59:59.999+08:00` }
      : {}),
  });
  return new URLSearchParams(
    Object.entries(input).map(([key, value]) => [key, String(value)]),
  ).toString();
}

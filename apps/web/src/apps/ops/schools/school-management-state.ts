import type { scopeSchoolsSchema } from "@smart-sport/contracts";
import type { TableQuery } from "../../../shared/components/data-table/types";

type SchoolPage = ReturnType<typeof scopeSchoolsSchema.parse>;
export function schoolManagementPage(
  lists: { operations: SchoolPage["items"]; profiles: SchoolPage["items"] },
  query: Pick<TableQuery, "page" | "pageSize">,
) {
  const all = new Map(
    [...lists.operations, ...lists.profiles].map((row) => [row.id, row]),
  );
  const rows = [...all.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "zh-CN") || a.id.localeCompare(b.id),
  );
  return {
    items: rows.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    ),
    total: rows.length,
    ...query,
    profileIds: new Set(lists.profiles.map((row) => row.id)),
    operationIds: new Set(lists.operations.map((row) => row.id)),
  };
}

import {
  type ScopeSchoolsQuery,
  scopeSchoolsSchema,
} from "@smart-sport/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { ApiError } from "../errors/api-error";
import type { SchoolChoice } from "../types/school";
import { findVisibleSchool, requestSchools } from "./use-schools";
export type SchoolPermissions = readonly ScopeSchoolsQuery["permission"][];

/** 一个菜单可能包含多个功能；合并各自可查看学校，不把动作范围混为一谈。 */
export async function requestMenuSchools(
  query: Omit<ScopeSchoolsQuery, "permission">,
  permissions: SchoolPermissions,
  signal: AbortSignal,
) {
  const rows = new Map<
    string,
    ReturnType<typeof scopeSchoolsSchema.parse>["items"][number]
  >();
  let accessible = false;
  for (const permission of permissions) {
    try {
      for (let page = 1; ; page++) {
        const result = await requestSchools(
          { page, pageSize: 100, keyword: query.keyword ?? "", permission },
          signal,
        );
        accessible = true;
        for (const row of result.items) {
          if (row.allowedActions.includes("view"))
            rows.set(row.id, { ...row, allowedActions: ["view"] });
        }
        if (page * result.pageSize >= result.total || !result.items.length)
          break;
      }
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 403) throw error;
    }
  }
  if (!accessible) throw new ApiError(403, 11101);
  const items = [...rows.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "zh-CN") || a.id.localeCompare(b.id),
  );
  return scopeSchoolsSchema.parse({
    items: items.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    ),
    total: items.length,
    page: query.page,
    pageSize: query.pageSize,
  });
}
export function useMenuSchools(
  identityId: string,
  query: Omit<ScopeSchoolsQuery, "permission">,
  permissions: SchoolPermissions,
) {
  return useQuery({
    queryKey: [identityId, "scope-schools", "menu", permissions, query],
    retry: false,
    queryFn: ({ signal }) =>
      permissions.length === 1
        ? requestSchools(
            {
              ...query,
              permission: permissions[0] as ScopeSchoolsQuery["permission"],
            },
            signal,
          )
        : requestMenuSchools(query, permissions, signal),
  });
}
export async function findMenuSchool(
  school: SchoolChoice,
  permissions: SchoolPermissions,
  signal: AbortSignal,
) {
  let accessible = false;
  for (const permission of permissions) {
    try {
      const found = await findVisibleSchool(school, permission, signal);
      accessible = true;
      if (found) return found;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 403) throw error;
    }
  }
  if (!accessible) throw new ApiError(403, 11101);
  return null;
}
export const menuSchoolOptions = (
  identityId: string,
  school: SchoolChoice,
  permissions: SchoolPermissions,
) =>
  queryOptions({
    queryKey: [
      identityId,
      "scope-schools",
      "selection",
      school.id,
      school.name,
      permissions,
    ],
    retry: false,
    staleTime: 0,
    queryFn: ({ signal }) => findMenuSchool(school, permissions, signal),
  });

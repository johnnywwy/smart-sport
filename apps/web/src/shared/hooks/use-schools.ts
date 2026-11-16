import {
  type ScopeSchoolsQuery,
  scopeSchoolsQuerySchema,
  scopeSchoolsSchema,
} from "@smart-sport/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import type { SchoolChoice } from "../types/school";

export const schoolsOptions = (
  identityId: string,
  input: ScopeSchoolsQuery,
  enabled = true,
) =>
  queryOptions({
    queryKey: [identityId, "scope-schools", input],
    enabled,
    retry: false,
    queryFn: ({ signal }) => requestSchools(input, signal),
  });
export function requestSchools(input: ScopeSchoolsQuery, signal: AbortSignal) {
  const query = scopeSchoolsQuerySchema.parse(input);
  return apiClient.request(
    `/api/v1/scope/schools?${new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]))}`,
    scopeSchoolsSchema,
    { signal, notify: false },
  );
}
/** 候选接口无按 id 查询；按真实名称搜索并遍历同名结果，绝不只信任本地历史。 */
export async function findVisibleSchool(
  school: SchoolChoice,
  permission: ScopeSchoolsQuery["permission"],
  signal: AbortSignal,
) {
  for (let page = 1; ; page++) {
    const result = await requestSchools(
      { page, pageSize: 100, keyword: school.name, permission },
      signal,
    );
    const found = result.items.find(
      (item) => item.id === school.id && item.allowedActions.includes("view"),
    );
    if (found) return found;
    if (page * result.pageSize >= result.total || !result.items.length)
      return null;
  }
}
export function useSchools(
  identityId: string,
  input: ScopeSchoolsQuery,
  enabled = true,
) {
  return useQuery(schoolsOptions(identityId, input, enabled));
}

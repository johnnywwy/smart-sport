import type {
  ScopeSchoolsQuery,
  scopeSchoolsSchema,
} from "@smart-sport/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { TableQuery } from "../../../../shared/components/data-table/types";
import { ApiError } from "../../../../shared/errors/api-error";
import { requestSchools } from "../../../../shared/hooks/use-schools";
import { schoolManagementPage } from "../school-management-state";

/** 两类查看范围独立查询；档案权限不能借用学校运营权限。 */
async function candidates(
  permission: ScopeSchoolsQuery["permission"],
  keyword: string,
  signal: AbortSignal,
) {
  const rows: ReturnType<typeof scopeSchoolsSchema.parse>["items"] = [];
  try {
    for (let page = 1; ; page++) {
      const data = await requestSchools(
        { page, pageSize: 100, keyword, permission },
        signal,
      );
      rows.push(
        ...data.items.filter((row) => row.allowedActions.includes("view")),
      );
      if (page * data.pageSize >= data.total || !data.items.length) break;
    }
    return rows;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return null;
    throw error;
  }
}

export function schoolManagementOptions(
  identityId: string,
  company: boolean,
  query: TableQuery,
) {
  return queryOptions({
    queryKey: [identityId, "scope-schools", "management", company, query],
    retry: false,
    queryFn: async ({ signal }) => {
      if (!company) {
        const data = await requestSchools(
          {
            page: query.page,
            pageSize: query.pageSize,
            keyword: query.keyword,
            permission: "ops:school:view",
          },
          signal,
        );
        return {
          ...data,
          profileIds: new Set<string>(),
          operationIds: new Set(data.items.map((row) => row.id)),
        };
      }
      const [operations, profiles] = await Promise.all([
        candidates("ops:school:view", query.keyword, signal),
        candidates("school:profile:view", query.keyword, signal),
      ]);
      if (operations === null && profiles === null)
        throw new ApiError(403, 11101);
      return schoolManagementPage(
        { operations: operations ?? [], profiles: profiles ?? [] },
        { page: query.page, pageSize: query.pageSize },
      );
    },
  });
}
export function useSchoolManagement(
  identityId: string,
  company: boolean,
  query: TableQuery,
) {
  return useQuery(schoolManagementOptions(identityId, company, query));
}

import type { RoleDetail, RoleSummary } from "@smart-sport/contracts";
import { useQueries } from "@tanstack/react-query";
import { type ActorScopes, grantsFit, roleValues } from "../role-state";
import { roleDetailOptions } from "./use-organization-roles";

/** 只有打开新建弹窗时才加载基础角色；缺失的权限详情不会被当成可分配。 */
export function useRoleBases(
  identityId: string,
  roles: RoleSummary[],
  scopes: ActorScopes,
  open: boolean,
) {
  const queries = useQueries({
    queries: roles
      .filter((role) => role.kind === "preset")
      .map((role) => ({
        ...roleDetailOptions(identityId, role.id),
        enabled: open,
      })),
  });
  const pending = queries.some((query) => query.isPending);
  const error = queries.some((query) => query.isError);
  const bases: RoleDetail[] =
    pending || error
      ? []
      : queries.flatMap((query) =>
          query.data && grantsFit(scopes, roleValues(query.data))
            ? [query.data]
            : [],
        );
  return {
    bases,
    pending,
    error,
    retry: () => Promise.all(queries.map((query) => query.refetch())),
  };
}

import {
  availableModulesSchema,
  type ModuleCode,
  moduleMenusSchema,
} from "@smart-sport/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import { useSession } from "../stores/session";
export const availableModulesOptions = (identityId: string | undefined) =>
  queryOptions({
    queryKey: [identityId, "available-modules"],
    enabled: !!identityId,
    queryFn: ({ signal }) =>
      apiClient.request("/api/v1/modules/available", availableModulesSchema, {
        signal,
      }),
  });
export const moduleMenusOptions = (
  identityId: string | undefined,
  module: ModuleCode | undefined,
) =>
  queryOptions({
    queryKey: [identityId, "module-menus", module],
    enabled: !!identityId && !!module,
    queryFn: ({ signal }) =>
      apiClient.request(
        `/api/v1/menus/current?module=${module}`,
        moduleMenusSchema,
        { signal },
      ),
  });
export function useAvailableModules() {
  return useQuery(
    availableModulesOptions(useSession((state) => state.currentIdentity?.id)),
  );
}
export function useModuleMenus(module: ModuleCode | undefined) {
  return useQuery(
    moduleMenusOptions(
      useSession((state) => state.currentIdentity?.id),
      module,
    ),
  );
}

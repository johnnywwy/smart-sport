import {
  availableAppsSchema,
  type CurrentMenusQuery,
  currentMenusQuerySchema,
  currentMenusSchema,
} from "@smart-sport/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import { useSession } from "../stores/session";

export const availableAppsOptions = (identityId: string | undefined) =>
  queryOptions({
    queryKey: [identityId, "available-apps"],
    enabled: !!identityId,
    queryFn: ({ signal }) =>
      apiClient.request("/api/v1/apps/available", availableAppsSchema, {
        signal,
      }),
  });
export const currentMenusOptions = (
  identityId: string | undefined,
  app: CurrentMenusQuery["app"],
) =>
  queryOptions({
    queryKey: [identityId, "current-menus", app],
    enabled: !!identityId,
    queryFn: ({ signal }) => {
      const query = currentMenusQuerySchema.parse({ app });
      return apiClient.request(
        `/api/v1/menus/current?app=${query.app}`,
        currentMenusSchema,
        { signal },
      );
    },
  });
export function useAvailableApps() {
  const identityId = useSession((state) => state.currentIdentity?.id);
  return useQuery(availableAppsOptions(identityId));
}
export function useCurrentMenus(app: CurrentMenusQuery["app"]) {
  const identityId = useSession((state) => state.currentIdentity?.id);
  return useQuery(currentMenusOptions(identityId, app));
}

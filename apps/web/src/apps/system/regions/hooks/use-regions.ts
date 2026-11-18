import {
  confirmRegionSyncSchema,
  regionManagementListSchema,
  regionSyncPreviewSchema,
  regionSyncResultSchema,
} from "@smart-sport/contracts";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../../shared/api/client";
import type { TableQuery } from "../../../../shared/components/data-table/types";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";
import { useApiEvents } from "../../../../shared/stores/api-events";
import { initialRegionQuery, regionQueryString } from "../region-state";
export const regionsOptions = (
  identityId: string,
  query: TableQuery,
  parent?: string,
) =>
  queryOptions({
    queryKey: [
      identityId,
      "region-management",
      regionQueryString(query, parent),
    ],
    retry: false,
    queryFn: ({ signal }) =>
      apiClient.request(
        `/api/v1/region-management?${regionQueryString(query, parent)}`,
        regionManagementListSchema,
        { signal, notify: false },
      ),
  });
export const regionPreviewOptions = (identityId: string) =>
  queryOptions({
    queryKey: [identityId, "region-sync-preview"],
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) =>
      apiClient.request(
        "/api/v1/region-management/sync-preview",
        regionSyncPreviewSchema,
        { signal, notify: false },
      ),
  });
export function useRegions(
  identityId: string,
  query: TableQuery,
  parent: string | undefined,
  previewOpen: boolean,
) {
  const client = useQueryClient();
  const provinces = useQuery(
    regionsOptions(identityId, { ...initialRegionQuery, pageSize: 100 }),
  );
  const items = useQuery({
    ...regionsOptions(identityId, query, parent),
    enabled: !!parent,
  });
  const preview = useQuery({
    ...regionPreviewOptions(identityId),
    enabled: previewOpen,
  });
  return {
    provinces,
    items,
    preview,
    reloadPreview: () => client.fetchQuery(regionPreviewOptions(identityId)),
    sync: async (fingerprint: string, context: FormSubmissionContext) => {
      const result = await apiClient.request(
        "/api/v1/region-management/sync",
        regionSyncResultSchema,
        {
          method: "POST",
          body: confirmRegionSyncSchema.parse({ fingerprint }),
          ...context,
        },
      );
      await Promise.all([
        client.invalidateQueries({
          queryKey: [identityId, "region-management"],
        }),
        client.invalidateQueries({ queryKey: [identityId, "regions"] }),
        client.invalidateQueries({
          queryKey: [identityId, "region-sync-preview"],
          refetchType: "none",
        }),
      ]);
      useApiEvents
        .getState()
        .notifySuccess(`区划已同步，应用 ${result.applied} 项变更。`);
    },
  };
}

import {
  identityVisibleQuerySchema,
  identityVisibleSchema,
  type ScopeSchoolsQuery,
} from "@smart-sport/contracts";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../../../shared/api/client";
export function useVisibleScope(
  identityId: string,
  targetId: string,
  query: ScopeSchoolsQuery,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [identityId, "scope-visible", targetId, query],
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      apiClient.request(
        `/api/v1/identities/${targetId}/visible?${new URLSearchParams(Object.entries(identityVisibleQuerySchema.parse(query)).map(([key, value]) => [key, String(value)]))}`,
        identityVisibleSchema,
        { signal, notify: false },
      ),
  });
}

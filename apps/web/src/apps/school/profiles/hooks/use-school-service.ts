import { schoolAppsSchema } from "@smart-sport/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiClient } from "../../../../shared/api/client";
export const schoolServiceOptions = (identityId: string, schoolId: string) =>
  queryOptions({
    queryKey: [identityId, "school-service", schoolId],
    retry: false,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: ({ signal }) =>
      apiClient.request(`/api/v1/schools/${schoolId}/apps`, schoolAppsSchema, {
        signal,
        notify: false,
      }),
  });
export function useSchoolService(identityId: string, schoolId: string) {
  return useQuery(schoolServiceOptions(identityId, schoolId));
}

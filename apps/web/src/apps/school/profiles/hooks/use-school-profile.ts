import {
  schoolProfileSchema,
  type UpdateSchoolProfile,
  updateSchoolProfileSchema,
} from "@smart-sport/contracts";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../../shared/api/client";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";
import { useApiEvents } from "../../../../shared/stores/api-events";
import { profileValues } from "../profile-state";

export const schoolProfileOptions = (identityId: string, schoolId: string) =>
  queryOptions({
    queryKey: [identityId, "school-profile", schoolId],
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) =>
      apiClient.request(
        `/api/v1/schools/${schoolId}/profile`,
        schoolProfileSchema,
        { signal, notify: false },
      ),
  });

export function useSchoolProfile(identityId: string, schoolId: string) {
  const options = schoolProfileOptions(identityId, schoolId);
  const profile = useQuery(options);
  const client = useQueryClient();
  return {
    profile,
    save: async (
      values: UpdateSchoolProfile,
      context: FormSubmissionContext,
    ) => {
      const saved = await apiClient.request(
        `/api/v1/schools/${schoolId}/profile`,
        schoolProfileSchema,
        {
          method: "PATCH",
          body: updateSchoolProfileSchema.parse(values),
          ...context,
        },
      );
      client.setQueryData(options.queryKey, saved);
      void client.invalidateQueries({
        queryKey: [identityId, "scope-schools"],
      });
      useApiEvents.getState().notifySuccess("学校档案已保存。");
    },
    reload: async () => {
      const result = await profile.refetch();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("档案已不可用，请关闭后重试。");
      return {
        values: profileValues(result.data),
        version: result.data.version,
      };
    },
  };
}

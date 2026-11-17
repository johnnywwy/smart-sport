import {
  systemParamListSchema,
  systemParamSchema,
  type UpdateSystemParam,
  updateSystemParamSchema,
} from "@smart-sport/contracts";
import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "../../../../shared/api/client";
import type { TableQuery } from "../../../../shared/components/data-table/types";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";
import { paramQueryString } from "../param-state";

const defaults = {
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
};
export const paramsOptions = (identityId: string, query: TableQuery) =>
  queryOptions({
    ...defaults,
    queryKey: [identityId, "system-params", paramQueryString(query)],
    queryFn: ({ signal }) =>
      apiClient.request(
        `/api/v1/system-params?${paramQueryString(query)}`,
        systemParamListSchema,
        { signal, notify: false },
      ),
  });
export const paramOptions = (identityId: string, id: string) =>
  queryOptions({
    ...defaults,
    queryKey: [identityId, "system-param", id],
    staleTime: 0,
    queryFn: ({ signal }) =>
      apiClient.request(`/api/v1/system-params/${id}`, systemParamSchema, {
        signal,
        notify: false,
      }),
  });
export function saveParam(
  id: string,
  values: UpdateSystemParam,
  context: FormSubmissionContext,
) {
  return apiClient.request(`/api/v1/system-params/${id}`, systemParamSchema, {
    method: "PATCH",
    body: updateSystemParamSchema.parse(values),
    ...context,
  });
}

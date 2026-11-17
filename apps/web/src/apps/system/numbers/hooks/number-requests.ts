import {
  numberRuleListSchema,
  numberRuleSchema,
  type UpdateNumberRule,
  updateNumberRuleSchema,
} from "@smart-sport/contracts";
import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "../../../../shared/api/client";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";

export const numberRulesOptions = (identityId: string) =>
  queryOptions({
    queryKey: [identityId, "number-rules"],
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) =>
      apiClient.request("/api/v1/number-rules", numberRuleListSchema, {
        signal,
        notify: false,
      }),
  });
export function saveNumberRule(
  id: string,
  values: UpdateNumberRule,
  context: FormSubmissionContext,
) {
  return apiClient.request(`/api/v1/number-rules/${id}`, numberRuleSchema, {
    method: "PATCH",
    body: updateNumberRuleSchema.parse(values),
    ...context,
  });
}

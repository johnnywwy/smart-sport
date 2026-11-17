import type { NumberRule, UpdateNumberRule } from "@smart-sport/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";
import { ApiError } from "../../../../shared/errors/api-error";
import { useApiEvents } from "../../../../shared/stores/api-events";
import { numberRulesOptions, saveNumberRule } from "./number-requests";

export function useNumberRules(identityId: string) {
  const options = numberRulesOptions(identityId);
  const rules = useQuery(options);
  const client = useQueryClient();
  return {
    rules,
    save: async (
      id: string,
      values: UpdateNumberRule,
      context: FormSubmissionContext,
    ) => {
      const saved = await saveNumberRule(id, values, context);
      client.setQueryData<NumberRule[]>(options.queryKey, (rows) =>
        (rows ?? []).map((row) => (row.id === saved.id ? saved : row)),
      );
      useApiEvents.getState().notifySuccess(`已保存${saved.name}的编号规则。`);
    },
    reload: async (id: string) => {
      const rows = await client.fetchQuery({ ...options, staleTime: 0 });
      const row = rows.find((item) => item.id === id);
      if (!row) throw new ApiError(404, 90004);
      return row;
    },
  };
}

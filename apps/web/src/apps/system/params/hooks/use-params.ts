import type { UpdateSystemParam } from "@smart-sport/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TableQuery } from "../../../../shared/components/data-table/types";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";
import { useApiEvents } from "../../../../shared/stores/api-events";
import { paramOptions, paramsOptions, saveParam } from "./param-requests";
export function useParams(identityId: string, query: TableQuery) {
  const items = useQuery(paramsOptions(identityId, query));
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: [identityId, "system-params"] }),
      client.invalidateQueries({ queryKey: [identityId, "system-param"] }),
    ]);
  return {
    items,
    save: async (
      id: string,
      values: UpdateSystemParam,
      context: FormSubmissionContext,
    ) => {
      try {
        const saved = await saveParam(id, values, context);
        client.setQueryData(paramOptions(identityId, id).queryKey, saved);
        useApiEvents.getState().notifySuccess(`已保存“${saved.name}”。`);
      } finally {
        await refresh();
      }
    },
    reload: (id: string) => client.fetchQuery(paramOptions(identityId, id)),
  };
}

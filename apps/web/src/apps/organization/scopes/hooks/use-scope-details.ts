import {
  departmentScopesSchema,
  identityScopeDetailsSchema,
  identityScopesSchema,
  type SetIdentityScopes,
  setIdentityScopesSchema,
} from "@smart-sport/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../../shared/api/client";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";
import { useApiEvents } from "../../../../shared/stores/api-events";
import {
  type ScopeTarget,
  scopeDetailsPath,
  scopeTargetKey,
} from "../scope-state";
export type ScopeDetails =
  | ReturnType<typeof departmentScopesSchema.parse>
  | ReturnType<typeof identityScopeDetailsSchema.parse>;
export function useScopeDetails(identityId: string, target: ScopeTarget) {
  const client = useQueryClient(),
    key = scopeTargetKey(identityId, target),
    path = scopeDetailsPath(target);
  const read = (signal: AbortSignal): Promise<ScopeDetails> =>
    target.kind === "department"
      ? apiClient.request(path, departmentScopesSchema, { signal })
      : apiClient.request(path, identityScopeDetailsSchema, { signal });
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => read(signal),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return {
    query,
    reload: async () => {
      const result = await query.refetch();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("范围读取失败");
      return result.data;
    },
    save: async (input: SetIdentityScopes, context: FormSubmissionContext) => {
      const options = {
        method: "PUT" as const,
        body: setIdentityScopesSchema.parse(input),
        ...context,
      };
      if (target.kind === "department")
        await apiClient.request(path, departmentScopesSchema, options);
      else await apiClient.request(path, identityScopesSchema, options);
      await Promise.all(
        [
          "scope-details",
          "scope-visible",
          "scope-preview",
          "departments",
          "member-detail",
          "members",
        ].map((part) =>
          client.invalidateQueries({ queryKey: [identityId, part] }),
        ),
      );
      useApiEvents
        .getState()
        .notifySuccess(
          target.kind === "department"
            ? "部门负责范围已保存。"
            : "本人额外负责范围已保存。",
        );
    },
  };
}
export type ScopeDetailsData = ReturnType<typeof useScopeDetails>;

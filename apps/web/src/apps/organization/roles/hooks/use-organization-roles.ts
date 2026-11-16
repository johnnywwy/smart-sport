import {
  type CreateRole,
  createRoleSchema,
  type IdentitySummary,
  type ResetRole,
  type RoleDetail,
  type RoleSummary,
  resetRoleSchema,
  roleDetailSchema,
  roleListSchema,
  type SaveRoleGrants,
  saveRoleGrantsSchema,
} from "@smart-sport/contracts";
import {
  queryOptions,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../../../shared/api/client";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";
import { useApiEvents } from "../../../../shared/stores/api-events";
import { actorScopes, roleValues } from "../role-state";

export type RoleConfirmation = { kind: "save" | "reset"; role: RoleDetail };
export const roleDetailOptions = (identityId: string, id: string | undefined) =>
  queryOptions({
    queryKey: [identityId, "role-detail", id],
    enabled: !!id,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) =>
      apiClient.request(`/api/v1/roles/${id}`, roleDetailSchema, { signal }),
  });

export function useOrganizationRoles(
  identity: IdentitySummary,
  selectedId: string | undefined,
) {
  const client = useQueryClient();
  const queryKey = [identity.id, "roles"];
  const list = useQuery({
    queryKey,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) =>
      apiClient.request("/api/v1/roles", roleListSchema, { signal }),
  });
  const id = list.data?.some((role) => role.id === selectedId)
    ? selectedId
    : list.data?.[0]?.id;
  const detail = useQuery(roleDetailOptions(identity.id, id));
  const actors = useQueries({
    queries: identity.roleIds.map((roleId) => ({
      ...roleDetailOptions(identity.id, roleId),
      refetchOnWindowFocus: true,
    })),
  });
  const actorReady = actors.every((query) => query.isSuccess);
  const scopes = actorScopes(
    actorReady
      ? actors.flatMap((query) => (query.data ? [query.data] : []))
      : [],
  );
  const [confirmation, setConfirmation] = useState<RoleConfirmation | null>(
    null,
  );
  const resolver = useRef<((value: boolean) => void) | null>(null);
  useEffect(
    () => () => {
      resolver.current?.(false);
      resolver.current = null;
    },
    [],
  );
  const confirm = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setConfirmation(null);
  };
  const ask = (value: RoleConfirmation, signal: AbortSignal) =>
    new Promise<boolean>((done) => {
      if (signal.aborted) return done(false);
      const finish = (accepted: boolean) => {
        signal.removeEventListener("abort", abort);
        done(accepted);
      };
      const abort = () => {
        resolver.current = null;
        setConfirmation(null);
        finish(false);
      };
      signal.addEventListener("abort", abort, { once: true });
      resolver.current = finish;
      setConfirmation(value);
    });
  const accept = (role: RoleDetail, message: string) => {
    client.setQueryData([identity.id, "role-detail", role.id], role);
    client.setQueryData<RoleSummary[]>(queryKey, (current) => {
      if (!current) return [role];
      return current.some((item) => item.id === role.id)
        ? current.map((item) => (item.id === role.id ? role : item))
        : [...current, role];
    });
    void client.invalidateQueries({ queryKey: [identity.id, "scope-schools"] });
    useApiEvents.getState().notifySuccess(message);
  };
  return {
    list,
    detail,
    scopes,
    actorReady,
    actorError: actors.some((query) => query.isError),
    retryActor: () => Promise.all(actors.map((query) => query.refetch())),
    confirmation,
    confirm,
    create: async (values: CreateRole, context: FormSubmissionContext) => {
      const saved = await apiClient.request("/api/v1/roles", roleDetailSchema, {
        method: "POST",
        body: createRoleSchema.parse(values),
        ...context,
      });
      accept(saved, `已新建角色“${saved.name}”，可继续调整权限。`);
      return saved;
    },
    save: async (
      role: RoleDetail,
      values: SaveRoleGrants,
      context: FormSubmissionContext,
    ) => {
      if (!(await ask({ kind: "save", role }, context.signal))) return;
      const saved = await apiClient.request(
        `/api/v1/roles/${role.id}/grants`,
        roleDetailSchema,
        {
          method: "PUT",
          body: saveRoleGrantsSchema.parse(values),
          ...context,
        },
      );
      accept(saved, "角色权限已保存，新的设置立即生效。");
    },
    reset: async (
      role: RoleDetail,
      input: ResetRole,
      context: FormSubmissionContext,
    ) => {
      if (!(await ask({ kind: "reset", role }, context.signal))) return;
      const saved = await apiClient.request(
        `/api/v1/roles/${role.id}/reset`,
        roleDetailSchema,
        {
          method: "POST",
          body: resetRoleSchema.parse(input),
          ...context,
        },
      );
      accept(saved, "已恢复基础角色的权限和数据范围。");
    },
    reload: async () => {
      const result = await detail.refetch();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("角色已不可用，请重新选择。");
      return { values: roleValues(result.data), version: result.data.version };
    },
  };
}

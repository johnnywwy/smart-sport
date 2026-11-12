import {
  presetRoleImpactSchema,
  presetRoleListSchema,
  presetRoleSchema,
  type ResetPresetRole,
  resetPresetRoleSchema,
  type SavePresetRole,
  savePresetRoleSchema,
} from "@smart-sport/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../../../shared/api/client";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";
import { ApiError } from "../../../../shared/errors/api-error";
import { useApiEvents } from "../../../../shared/stores/api-events";
import type { PresetRole, TemplateImpact } from "../template-state";

export type TemplateConfirmation = {
  kind: "save" | "reset";
  role: PresetRole;
  impact?: TemplateImpact;
  featureName?: string;
};

export function usePresetRoles(identityId: string) {
  const client = useQueryClient();
  const queryKey = [identityId, "preset-roles"];
  const query = useQuery({
    queryKey,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) =>
      apiClient.request("/api/v1/preset-roles", presetRoleListSchema, {
        signal,
      }),
  });
  const [confirmation, setConfirmation] = useState<TemplateConfirmation | null>(
    null,
  );
  const resolve = useRef<((confirmed: boolean) => void) | null>(null);
  useEffect(
    () => () => {
      resolve.current?.(false);
      resolve.current = null;
    },
    [],
  );
  const confirm = (confirmed: boolean) => {
    resolve.current?.(confirmed);
    resolve.current = null;
    setConfirmation(null);
  };
  const ask = (value: TemplateConfirmation, signal: AbortSignal) =>
    new Promise<boolean>((done) => {
      if (signal.aborted) return done(false);
      const finish = (accepted: boolean) => {
        signal.removeEventListener("abort", abort);
        done(accepted);
      };
      const abort = () => {
        resolve.current = null;
        setConfirmation(null);
        finish(false);
      };
      signal.addEventListener("abort", abort, { once: true });
      resolve.current = finish;
      setConfirmation(value);
    });
  const accept = (role: PresetRole, message: string) => {
    client.setQueryData<PresetRole[]>(queryKey, (current) =>
      current?.map((item) => (item.id === role.id ? role : item)),
    );
    useApiEvents.getState().notifySuccess(message);
  };
  return {
    query,
    confirmation,
    confirm,
    reload: async (id: string) => {
      const result = await query.refetch();
      if (result.error) throw result.error;
      const role = result.data?.find((item) => item.id === id);
      if (!role) throw new Error("角色模板已不可用，请重新选择。");
      return { values: templateSnapshot(role), version: role.version };
    },
    save: async (
      role: PresetRole,
      values: SavePresetRole,
      context: FormSubmissionContext,
    ) => {
      const body = savePresetRoleSchema.parse(values);
      const impact = await apiClient.request(
        `/api/v1/preset-roles/${role.id}/impact`,
        presetRoleImpactSchema,
        { method: "POST", body, ...context },
      );
      if (impact.version !== body.version) throw new ApiError(409, 90002);
      if (!(await ask({ kind: "save", role, impact }, context.signal))) return;
      const saved = await apiClient.request(
        `/api/v1/preset-roles/${role.id}`,
        presetRoleSchema,
        { method: "PUT", body, ...context },
      );
      accept(saved, "角色模板已保存，新的权限设置立即生效。");
    },
    reset: async (
      role: PresetRole,
      input: ResetPresetRole,
      context: FormSubmissionContext,
      featureName?: string,
    ) => {
      if (
        !(await ask(
          {
            kind: "reset",
            role,
            ...(featureName ? { featureName } : {}),
          },
          context.signal,
        ))
      )
        return;
      const saved = await apiClient.request(
        `/api/v1/preset-roles/${role.id}/reset`,
        presetRoleSchema,
        {
          method: "POST",
          body: resetPresetRoleSchema.parse(input),
          ...context,
        },
      );
      accept(saved, "已恢复代码默认设置。");
    },
  };
}

// 重新加载返回完整字段，避免表单版本更新时遗漏未展示的功能档位。
function templateSnapshot(role: PresetRole): SavePresetRole {
  return {
    version: role.version,
    dataScope: role.dataScope,
    remark: role.remark,
    grants: role.grants.map(({ app, feature, grant }) => ({
      app,
      feature,
      grant,
    })),
  };
}

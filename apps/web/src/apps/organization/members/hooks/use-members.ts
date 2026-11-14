import {
  type CreateMember,
  createMemberResponseSchema,
  type Member,
  type MemberListQuery,
  memberDetailSchema,
  memberListQuerySchema,
  memberListSchema,
  memberOptionsSchema,
  memberSchema,
  setMemberStatusSchema,
  type UpdateMember,
  updateMemberSchema,
} from "@smart-sport/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../../../shared/api/client";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";
import { useApiEvents } from "../../../../shared/stores/api-events";
import { runMemberBatch } from "../member-state";

export function useMembers(
  identityId: string,
  query: MemberListQuery,
  selectedId?: string,
  departmentMode = false,
) {
  const client = useQueryClient();
  const [revision, setRevision] = useState(0);
  const controller = useRef(new AbortController());
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current.abort();
  }, []);
  const list = useQuery({
    queryKey: [identityId, "members", query],
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      apiClient.request(
        `/api/v1/members?${new URLSearchParams(Object.entries(memberListQuerySchema.parse(query)).map(([k, v]) => [k, String(v)]))}`,
        memberListSchema,
        { signal },
      ),
  });
  const moveCandidates = useQuery({
    queryKey: [identityId, "member-move-candidates"],
    enabled: departmentMode,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      apiClient.request(
        "/api/v1/members?page=1&pageSize=20",
        memberListSchema,
        { signal },
      ),
  });
  const options = useQuery({
    queryKey: [identityId, "member-options"],
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      apiClient.request("/api/v1/members/options", memberOptionsSchema, {
        signal,
      }),
  });
  const detail = useQuery({
    queryKey: [identityId, "member-detail", selectedId],
    enabled: !!selectedId,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      apiClient.request(`/api/v1/members/${selectedId}`, memberDetailSchema, {
        signal,
      }),
  });
  async function invalidate() {
    if (!controller.current.signal.aborted) setRevision((v) => v + 1);
    await Promise.all(
      [
        "members",
        "member-options",
        "departments",
        "member-move-candidates",
      ].map((key) => client.invalidateQueries({ queryKey: [identityId, key] })),
    );
    await client.invalidateQueries({ queryKey: [identityId, "member-detail"] });
  }
  async function update(
    row: Member,
    value: UpdateMember,
    context: FormSubmissionContext,
  ) {
    const saved = await apiClient.request(
      `/api/v1/members/${row.id}`,
      memberSchema,
      { method: "PATCH", body: updateMemberSchema.parse(value), ...context },
    );
    await invalidate();
    useApiEvents.getState().notifySuccess("成员部门与角色已保存。");
    return saved;
  }
  return {
    list,
    canMoveMembers: (moveCandidates.data?.items ?? list.data?.items ?? []).some(
      (row) => row.allowedActions.includes("update"),
    ),
    options,
    detail,
    revision,
    update,
    reload: (id: string) =>
      apiClient.request(`/api/v1/members/${id}`, memberDetailSchema, {
        signal: controller.current.signal,
      }),
    create: async (value: CreateMember, context: FormSubmissionContext) => {
      const result = await apiClient.request(
        "/api/v1/members",
        createMemberResponseSchema,
        { method: "POST", body: value, ...context },
      );
      await invalidate();
      useApiEvents
        .getState()
        .notifySuccess(
          result.accountCreated ? "成员账号已创建。" : "已追加本组织身份。",
        );
      return result;
    },
    status: async (row: Member, signal: AbortSignal) => {
      await apiClient.request(
        `/api/v1/members/${row.id}/status`,
        memberSchema,
        {
          method: "POST",
          body: setMemberStatusSchema.parse({
            version: row.version,
            status: row.status === 1 ? 0 : 1,
          }),
          signal,
        },
      );
      await invalidate();
      useApiEvents
        .getState()
        .notifySuccess(
          row.status === 1 ? "本组织身份已停用。" : "本组织身份已启用。",
        );
    },
    batch: async (
      rows: readonly Member[],
      patch: Pick<UpdateMember, "departmentId" | "roleIds">,
      context: FormSubmissionContext,
    ) => {
      const result = await runMemberBatch(
        rows,
        (row) =>
          apiClient.request(`/api/v1/members/${row.id}`, memberSchema, {
            method: "PATCH",
            body: updateMemberSchema.parse({ version: row.version, ...patch }),
            signal: context.signal,
            notify: false,
            idempotencyKey: `${context.idempotencyKey}:${row.id}`,
          }),
        () => context.signal.aborted,
      );
      await invalidate();
      if (result.succeeded.length)
        useApiEvents
          .getState()
          .notifySuccess(`已更新 ${result.succeeded.length} 位成员。`);
      return result;
    },
  };
}
export type MembersData = ReturnType<typeof useMembers>;

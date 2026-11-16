import {
  type CreateDepartment,
  createDepartmentSchema,
  type Department,
  deleteDepartmentSchema,
  departmentSchema,
  departmentTreeSchema,
  emptyResultSchema,
  type UpdateDepartment,
  updateDepartmentSchema,
} from "@smart-sport/contracts";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { apiClient } from "../../../../shared/api/client";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";
import { ApiError } from "../../../../shared/errors/api-error";
import { useApiEvents } from "../../../../shared/stores/api-events";
import { flattenDepartments } from "../department-state";

export const departmentTreeOptions = (identityId: string) =>
  queryOptions({
    queryKey: [identityId, "departments"],
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      apiClient.request("/api/v1/departments/tree", departmentTreeSchema, {
        signal,
      }),
  });
export function useDepartments(identityId: string) {
  const options = departmentTreeOptions(identityId);
  const tree = useQuery(options);
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);
  async function write<T>(
    action: (signal: AbortSignal) => Promise<T>,
    message: string,
    context?: FormSubmissionContext,
  ) {
    if (locked.current) throw new Error("部门操作尚未完成");
    locked.current = true;
    setBusy(true);
    const controller = new AbortController();
    active.current = controller;
    try {
      const result = await action(context?.signal ?? controller.signal);
      await Promise.all(
        ["departments", "scope-details", "scope-visible", "scope-preview"].map(
          (part) => client.invalidateQueries({ queryKey: [identityId, part] }),
        ),
      );
      if (mounted.current) useApiEvents.getState().notifySuccess(message);
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.code === 90002 && !context)
        await client.invalidateQueries({ queryKey: options.queryKey });
      throw error;
    } finally {
      locked.current = false;
      if (active.current === controller) active.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    tree,
    busy,
    create: (values: CreateDepartment, context: FormSubmissionContext) =>
      write(
        (signal) =>
          apiClient.request("/api/v1/departments", departmentSchema, {
            method: "POST",
            body: createDepartmentSchema.parse(values),
            ...context,
            signal,
          }),
        "部门已创建。",
        context,
      ),
    update: (
      row: Department,
      values: UpdateDepartment,
      context: FormSubmissionContext,
    ) =>
      write(
        (signal) =>
          apiClient.request(`/api/v1/departments/${row.id}`, departmentSchema, {
            method: "PATCH",
            body: updateDepartmentSchema.parse(values),
            ...context,
            signal,
          }),
        "部门已保存。",
        context,
      ),
    move: (row: Department, parentId: string | null) =>
      write(
        (signal) =>
          apiClient.request(`/api/v1/departments/${row.id}`, departmentSchema, {
            method: "PATCH",
            body: updateDepartmentSchema.parse({
              version: row.version,
              parentId,
            }),
            signal,
          }),
        "部门上级已调整。",
      ),
    remove: (row: Department) =>
      write(
        (signal) =>
          apiClient.request(
            `/api/v1/departments/${row.id}`,
            emptyResultSchema,
            {
              method: "DELETE",
              body: deleteDepartmentSchema.parse({ version: row.version }),
              signal,
            },
          ),
        "部门已删除。",
      ),
    reload: async (id: string) => {
      const result = await tree.refetch();
      if (result.error) throw result.error;
      const row = flattenDepartments(result.data?.items ?? []).find(
        (item) => item.id === id,
      );
      if (!row) throw new Error("部门已不存在，请关闭后重新选择。");
      return row;
    },
  };
}

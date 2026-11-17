import type {
  CreateDictItem,
  DictTypeCode,
  UpdateDictItem,
} from "@smart-sport/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TableQuery } from "../../../../shared/components/data-table/types";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";
import { useApiEvents } from "../../../../shared/stores/api-events";
import { selectedDictType } from "../dict-state";
import {
  createDictItem,
  deleteDictItem,
  dictItemOptions,
  dictItemsOptions,
  dictTypesOptions,
  saveDictItem,
} from "./dict-requests";
export function useDicts(
  identityId: string,
  selected: DictTypeCode | undefined,
  query: TableQuery,
) {
  const types = useQuery(dictTypesOptions(identityId));
  const type = selectedDictType(
    types.isError ? [] : (types.data ?? []),
    selected,
  );
  const items = useQuery({
    ...dictItemsOptions(identityId, type?.code ?? "stage", query),
    enabled: !!type,
  });
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: [identityId, "dict-types"] }),
      client.invalidateQueries({ queryKey: [identityId, "dict-items"] }),
      client.invalidateQueries({ queryKey: [identityId, "dict-item"] }),
    ]);
  const write = async <T>(action: () => Promise<T>, message: string) => {
    try {
      const result = await action();
      useApiEvents.getState().notifySuccess(message);
      return result;
    } finally {
      await refresh();
    }
  };
  return {
    types,
    type,
    items,
    create: (
      code: DictTypeCode,
      values: CreateDictItem,
      context: FormSubmissionContext,
    ) =>
      write(
        () => createDictItem(code, values, context),
        `已新增选项“${values.label}”。`,
      ),
    save: (
      id: string,
      values: UpdateDictItem,
      context: FormSubmissionContext,
    ) =>
      write(
        () => saveDictItem(id, values, context),
        `已保存选项“${values.label}”。`,
      ),
    remove: (
      id: string,
      label: string,
      version: number,
      context: FormSubmissionContext,
    ) =>
      write(
        () => deleteDictItem(id, version, context),
        `已删除选项“${label}”。`,
      ),
    reload: (code: DictTypeCode, id: string) =>
      client.fetchQuery(dictItemOptions(identityId, code, id)),
  };
}

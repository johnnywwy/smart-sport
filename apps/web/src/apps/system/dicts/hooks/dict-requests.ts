import {
  type CreateDictItem,
  createDictItemSchema,
  type DictItem,
  type DictTypeCode,
  deleteDictItemSchema,
  dictItemListSchema,
  dictItemSchema,
  dictTypesSchema,
  emptyResultSchema,
  type UpdateDictItem,
  updateDictItemSchema,
} from "@smart-sport/contracts";
import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "../../../../shared/api/client";
import type { TableQuery } from "../../../../shared/components/data-table/types";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";
import { ApiError } from "../../../../shared/errors/api-error";
import { dictQueryString } from "../dict-state";

const queryDefaults = {
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
};
export const dictTypesOptions = (identityId: string) =>
  queryOptions({
    ...queryDefaults,
    queryKey: [identityId, "dict-types"],
    queryFn: ({ signal }) =>
      apiClient.request("/api/v1/dict-types", dictTypesSchema, {
        signal,
        notify: false,
      }),
  });
export const dictItemsOptions = (
  identityId: string,
  typeCode: DictTypeCode,
  query: TableQuery,
) =>
  queryOptions({
    ...queryDefaults,
    queryKey: [identityId, "dict-items", typeCode, dictQueryString(query)],
    queryFn: ({ signal }) =>
      apiClient.request(
        `/api/v1/dict-types/${typeCode}/items?${dictQueryString(query)}`,
        dictItemListSchema,
        { signal, notify: false },
      ),
  });
/** 没有单条读取端点；冲突重载按ID查找，不能依赖可能被他人改掉的名称或当前筛选。 */
export const dictItemOptions = (
  identityId: string,
  typeCode: DictTypeCode,
  id: string,
) =>
  queryOptions({
    ...queryDefaults,
    queryKey: [identityId, "dict-item", typeCode, id],
    staleTime: 0,
    queryFn: async ({ signal }): Promise<DictItem> => {
      for (let page = 1; ; page++) {
        const result = await apiClient.request(
          `/api/v1/dict-types/${typeCode}/items?page=${page}&pageSize=100&sort=sort%3Aasc`,
          dictItemListSchema,
          { signal, notify: false },
        );
        const row = result.items.find((item) => item.id === id);
        if (row) return row;
        if (result.items.length === 0 || page * result.pageSize >= result.total)
          throw new ApiError(404, 90004);
      }
    },
  });
export function createDictItem(
  typeCode: DictTypeCode,
  values: CreateDictItem,
  context: FormSubmissionContext,
) {
  return apiClient.request(
    `/api/v1/dict-types/${typeCode}/items`,
    dictItemSchema,
    { method: "POST", body: createDictItemSchema.parse(values), ...context },
  );
}
export function saveDictItem(
  id: string,
  values: UpdateDictItem,
  context: FormSubmissionContext,
) {
  return apiClient.request(`/api/v1/dict-items/${id}`, dictItemSchema, {
    method: "PATCH",
    body: updateDictItemSchema.parse(values),
    ...context,
  });
}
export function deleteDictItem(
  id: string,
  version: number,
  context: FormSubmissionContext,
) {
  return apiClient.request(`/api/v1/dict-items/${id}`, emptyResultSchema, {
    method: "DELETE",
    body: deleteDictItemSchema.parse({ version }),
    ...context,
  });
}

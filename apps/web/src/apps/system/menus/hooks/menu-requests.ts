import {
  type MenuOverride,
  type ModuleCode,
  menuOverrideListSchema,
  menuOverridesSavedSchema,
  type UpdateMenuOverrides,
  updateMenuOverridesSchema,
} from "@smart-sport/contracts";
import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "../../../../shared/api/client";
import type { TableQuery } from "../../../../shared/components/data-table/types";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";
import { initialMenuQuery, menuQueryString } from "../menu-state";

const defaults = {
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
};
export const menusOptions = (
  identityId: string,
  module: ModuleCode,
  query: TableQuery,
) =>
  queryOptions({
    ...defaults,
    queryKey: [
      identityId,
      "menu-overrides",
      module,
      menuQueryString(module, query),
    ],
    queryFn: ({ signal }) =>
      apiClient.request(
        `/api/v1/menus/overrides?${menuQueryString(module, query)}`,
        menuOverrideListSchema,
        { signal, notify: false },
      ),
  });
export async function allMenus(module: ModuleCode, signal: AbortSignal) {
  const items: MenuOverride[] = [];
  for (let page = 1; ; page++) {
    const result = await apiClient.request(
      `/api/v1/menus/overrides?${menuQueryString(module, { ...initialMenuQuery, page, pageSize: 100 })}`,
      menuOverrideListSchema,
      { signal, notify: false },
    );
    items.push(...result.items);
    if (items.length >= result.total || !result.items.length) return items;
  }
}
export function saveMenus(
  input: UpdateMenuOverrides,
  context: FormSubmissionContext,
) {
  return apiClient.request(
    "/api/v1/menus/overrides",
    menuOverridesSavedSchema,
    {
      method: "PATCH",
      body: updateMenuOverridesSchema.parse(input),
      ...context,
      notify: false,
    },
  );
}

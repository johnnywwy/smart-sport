import {
  type ScopeOptionsQuery,
  scopeOptionsQuerySchema,
  scopeOptionsSchema,
} from "@smart-sport/contracts";
import { apiClient } from "./client";

export const scopeOptionsKey = (
  identityId: string,
  query: ScopeOptionsQuery,
  targetIdentityId?: string,
) =>
  [
    identityId,
    "scope-options",
    targetIdentityId ?? null,
    scopeOptionsQuerySchema.parse(query),
  ] as const;

export function requestScopeOptions(
  query: ScopeOptionsQuery,
  signal: AbortSignal,
  targetIdentityId?: string,
) {
  const parsed = scopeOptionsQuerySchema.parse(query);
  const params = new URLSearchParams(
    Object.entries(parsed).map(([name, value]) => [name, String(value)]),
  );
  return apiClient.request(
    `/api/v1/${targetIdentityId ? `identities/${targetIdentityId}/scope-options` : "scope-options"}?${params}`,
    scopeOptionsSchema,
    { signal },
  );
}

/** 一个区划分支可能超过一页，全部加载完成后才移除展开占位。 */
export async function requestScopeBranch(
  orgId: string | undefined,
  parent: string | null,
  signal: AbortSignal,
  targetIdentityId?: string,
) {
  const query = {
    type: "region" as const,
    page: 1,
    pageSize: 100,
    ...(orgId ? { orgId } : {}),
    ...(parent ? { parent } : {}),
  };
  const first = await requestScopeOptions(query, signal, targetIdentityId);
  signal.throwIfAborted();
  const items = [...first.items];
  for (let page = 2; (page - 1) * first.pageSize < first.total; page++) {
    signal.throwIfAborted();
    const result = await requestScopeOptions(
      { ...query, page },
      signal,
      targetIdentityId,
    );
    items.push(...result.items);
  }
  signal.throwIfAborted();
  return {
    ...first,
    items: [
      ...new Map(
        items.map((item) => [`${item.type}:${item.value}`, item]),
      ).values(),
    ],
  };
}

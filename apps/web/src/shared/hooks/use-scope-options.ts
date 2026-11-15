import type { ScopeType } from "@smart-sport/contracts";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  requestScopeBranch,
  requestScopeOptions,
  scopeOptionsKey,
} from "../api/scope-options";
import type { ScopeCandidates } from "../components/scope-picker/types";

type Controls = {
  scopeKey: string;
  type: "region" | "school";
  keyword: string;
  page: number;
  expanded: Set<string>;
  visited: Set<string>;
};

export function useScopeOptions({
  identityId,
  orgId,
  allowedTypes,
  enabled = true,
}: {
  identityId: string;
  orgId?: string | undefined;
  allowedTypes: readonly ScopeType[];
  enabled?: boolean;
}): ScopeCandidates {
  const scopeKey = JSON.stringify([identityId, orgId ?? null]);
  const fresh = (): Controls => ({
    scopeKey,
    type: allowedTypes.includes("region") ? "region" : "school",
    keyword: "",
    page: 1,
    expanded: new Set(),
    visited: new Set(),
  });
  const [state, setState] = useState<Controls>(fresh);
  // 边界变化的本次渲染就使用新状态，不能短暂复用旧组织的搜索和展开分支。
  const current = state.scopeKey === scopeKey ? state : fresh();
  if (state.scopeKey !== scopeKey) setState(current);
  const patch = (changes: Partial<Controls>) =>
    setState((old) => ({
      ...(old.scopeKey === scopeKey ? old : fresh()),
      ...changes,
    }));
  const types = enabled
    ? allowedTypes.filter((type) => type === "region" || type === "school")
    : [];
  const activeType = types.includes(current.type)
    ? current.type
    : (types[0] ?? "region");
  const parents = [null, ...new Set([...current.visited, ...current.expanded])];
  const branches = useQueries({
    queries: parents.map((parent) => ({
      queryKey: [
        identityId,
        "scope-options",
        orgId ?? null,
        "region-branch",
        parent,
      ],
      enabled: enabled && types.includes("region"),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        requestScopeBranch(orgId, parent, signal),
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    })),
  });
  const schoolQuery = {
    type: "school" as const,
    page: current.page,
    pageSize: 20,
    ...(current.keyword.trim() ? { keyword: current.keyword.trim() } : {}),
    ...(orgId ? { orgId } : {}),
  };
  const schools = useQuery({
    queryKey: scopeOptionsKey(identityId, schoolQuery),
    enabled: enabled && types.includes("school") && activeType === "school",
    queryFn: ({ signal }) => requestScopeOptions(schoolQuery, signal),
    refetchOnWindowFocus: false,
  });
  return {
    scopeKey,
    allowedTypes: types,
    type: activeType,
    onTypeChange: (type) => {
      if (types.includes(type)) patch({ type });
    },
    regions: {
      branches: parents.map((parent, index) => {
        const query = branches[index];
        return {
          parent,
          items: types.includes("region")
            ? (query?.data?.items.filter((item) => item.type === "region") ??
              [])
            : [],
          loaded: !!query?.isSuccess,
          loading: !!query?.isPending,
          error: !!query?.isError,
          retry: () => {
            void query?.refetch();
          },
        };
      }),
      expanded: current.expanded,
      onExpandedChange: (expanded) => {
        const known = new Set(
          branches.flatMap(
            (query) => query.data?.items.map((item) => item.value) ?? [],
          ),
        );
        const next = new Set([...expanded].filter((value) => known.has(value)));
        patch({
          expanded: next,
          visited: new Set([...current.visited, ...next]),
        });
      },
    },
    schools: {
      items: types.includes("school")
        ? (schools.data?.items.filter((item) => item.type === "school") ?? [])
        : [],
      total: schools.data?.total ?? 0,
      page: current.page,
      pageSize: 20,
      keyword: current.keyword,
      loading: schools.isPending,
      error: schools.isError,
      retry: () => {
        void schools.refetch();
      },
      onKeywordChange: (keyword) => patch({ keyword, page: 1 }),
      onPageChange: (page) => patch({ page }),
    },
  };
}

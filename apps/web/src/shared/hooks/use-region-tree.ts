import { regionListSchema } from "@smart-sport/contracts";
import { useQueries } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiClient } from "../api/client";

export function useRegionTree(
  identityId: string,
  expandedCodes: readonly string[],
) {
  const [loadedBranches, setLoadedBranches] = useState<string[]>([]);
  useEffect(() => {
    setLoadedBranches((current) => {
      const next = [...new Set([...current, ...expandedCodes])];
      return next.length === current.length ? current : next;
    });
  }, [expandedCodes]);
  const parents = [null, ...new Set([...loadedBranches, ...expandedCodes])];
  const queries = useQueries({
    queries: parents.map((parent) => ({
      queryKey: [identityId, "regions", parent ?? "root"],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        apiClient.request(
          `/api/v1/regions${parent ? `?parent=${parent}` : ""}`,
          regionListSchema,
          { signal },
        ),
      staleTime: 300_000,
    })),
  });
  return {
    regions: queries.flatMap((query) => query.data ?? []),
    loadedParents: new Set(
      parents
        .filter((_, index) => queries[index]?.isSuccess)
        .map((parent) => parent ?? "root"),
    ),
    loading: queries[0]?.isPending ?? true,
    error: queries.some((query) => query.isError),
    retry: () => {
      for (const query of queries) if (query.isError) void query.refetch();
    },
  };
}

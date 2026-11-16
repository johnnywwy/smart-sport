import {
  type ScopeOption,
  scopePreviewRequestSchema,
  scopePreviewSchema,
} from "@smart-sport/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiClient } from "../../../../shared/api/client";
export function useScopePreview(
  identityId: string,
  value: readonly ScopeOption[],
) {
  const token = JSON.stringify(
    value
      .map(({ type, value }) => ({ type, value }))
      .sort((a, b) =>
        `${a.type}:${a.value}`.localeCompare(`${b.type}:${b.value}`),
      ),
  );
  const [debounced, setDebounced] = useState(token);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(token), 250);
    return () => clearTimeout(timer);
  }, [token]);
  const unavailable = value.some((item) => !item.available),
    waiting = debounced !== token;
  const query = useQuery({
    queryKey: [identityId, "scope-preview", debounced],
    enabled: !waiting && !unavailable,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      apiClient.request("/api/v1/scope/preview", scopePreviewSchema, {
        method: "POST",
        body: scopePreviewRequestSchema.parse({
          mode: "selection",
          scopes: JSON.parse(debounced),
        }),
        notify: false,
        signal,
      }),
  });
  return { query, waiting, unavailable };
}

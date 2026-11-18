import { auditLogListSchema } from "@smart-sport/contracts";
import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "../../../../shared/api/client";
import type { TableQuery } from "../../../../shared/components/data-table/types";
import { type AuditScope, auditQueryString } from "../audit-state";
export const auditOptions = (
  identityId: string,
  scope: AuditScope,
  query: TableQuery,
) =>
  queryOptions({
    queryKey: [identityId, "audit-logs", scope, auditQueryString(scope, query)],
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) =>
      apiClient.request(
        `/api/v1/audit-logs?${auditQueryString(scope, query)}`,
        auditLogListSchema,
        { signal, notify: false },
      ),
  });

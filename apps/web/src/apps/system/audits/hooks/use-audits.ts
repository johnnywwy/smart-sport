import { useQuery } from "@tanstack/react-query";
import type { TableQuery } from "../../../../shared/components/data-table/types";
import type { AuditScope } from "../audit-state";
import { auditOptions } from "./audit-requests";
export function useAudits(
  identityId: string,
  scope: AuditScope,
  query: TableQuery,
) {
  return useQuery(auditOptions(identityId, scope, query));
}

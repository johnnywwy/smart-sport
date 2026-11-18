import { Button } from "@heroui/react";
import type { AuditLog } from "@smart-sport/contracts";
import { useState } from "react";
import { type AuditScope, initialAuditQuery } from "../audit-state";
import { AuditDetails } from "../components/audit-details/AuditDetails";
import { AuditList } from "../components/audit-list/AuditList";
import { useAudits } from "../hooks/use-audits";
import "./AuditLogsPage.css";
export function AuditLogsPage({
  identityId,
  scope,
}: {
  identityId: string;
  scope: AuditScope;
}) {
  const [query, setQuery] = useState(initialAuditQuery);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const data = useAudits(identityId, scope, query);
  return (
    <div className="audit-logs-page">
      {query.filters.userId && (
        <div className="audit-current-operator">
          <span>当前操作人：{query.filters.operatorName ?? "原账号"}</span>
          <Button
            size="sm"
            variant="secondary"
            onPress={() =>
              setQuery((current) => ({
                ...current,
                page: 1,
                filters: { ...current.filters, userId: "", operatorName: "" },
              }))
            }
          >
            清除操作人筛选
          </Button>
        </div>
      )}
      <AuditList
        identityId={identityId}
        scope={scope}
        data={
          data.isError
            ? {
                items: [],
                total: 0,
                page: query.page,
                pageSize: query.pageSize,
              }
            : (data.data ?? {
                items: [],
                total: 0,
                page: query.page,
                pageSize: query.pageSize,
              })
        }
        query={query}
        onQueryChange={setQuery}
        status={{
          loading: data.isPending,
          error: data.isError,
          onRetry: () => void data.refetch(),
        }}
        onDetails={setSelected}
      />
      <p className="audit-logs-note">
        点击操作人可筛选该账号的记录。日期按北京时间查询；操作记录只读，未记录的结果显示为“已记录”。
      </p>
      {selected && !data.isError && (
        <AuditDetails row={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

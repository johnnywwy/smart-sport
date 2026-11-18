import { Button } from "@heroui/react";
import type { AuditLog } from "@smart-sport/contracts";
import { DataTable } from "../../../../../shared/components/data-table/DataTable";
import type {
  DataTableProps,
  TablePage,
  TableQuery,
} from "../../../../../shared/components/data-table/types";
import {
  auditActionName,
  auditIdentity,
  auditResult,
  auditTarget,
  auditTime,
} from "../../audit-labels";
import type { AuditScope } from "../../audit-state";
import { AuditFilters } from "../audit-filters/AuditFilters";
import "./AuditList.css";
export function AuditList({
  identityId,
  scope,
  data,
  query,
  onQueryChange,
  status,
  onDetails,
}: {
  identityId: string;
  scope: AuditScope;
  data: TablePage<AuditLog>;
  query: TableQuery;
  onQueryChange: (query: TableQuery) => void;
  status: DataTableProps<AuditLog>["status"];
  onDetails: (row: AuditLog) => void;
}) {
  return (
    <DataTable
      scopeKey={`${identityId}:${scope}`}
      data={data}
      query={query}
      onQueryChange={onQueryChange}
      {...(status ? { status } : {})}
      filterBar={
        <AuditFilters
          key={JSON.stringify(query.filters)}
          query={query}
          onChange={onQueryChange}
          disabled={Boolean(status?.loading)}
        />
      }
      config={{
        title: scope === "platform" ? "平台操作记录" : "操作记录",
        description:
          scope === "platform"
            ? "所有组织的操作都在这里，只能查看。"
            : "查看本组织的操作记录。",
        permissions: [],
        rowLabel: (row) =>
          `${auditTime(row.createdAt)} ${auditActionName(row.action)}`,
        rowDetails: { label: "详情", onPress: onDetails },
        columns: [
          {
            id: "createdAt",
            label: "时间",
            required: true,
            sortable: true,
            render: (row) => (
              <time dateTime={row.createdAt}>{auditTime(row.createdAt)}</time>
            ),
          },
          {
            id: "operator",
            label: "操作人",
            render: (row) =>
              row.userId ? (
                <Button
                  className="audit-operator"
                  variant="ghost"
                  aria-label={`筛选操作人：${row.operatorName ?? "原账号"}`}
                  onPress={() =>
                    onQueryChange({
                      ...query,
                      page: 1,
                      filters: {
                        ...query.filters,
                        userId: row.userId ?? "",
                        operatorLabel: row.operatorName ?? "原账号",
                      },
                    })
                  }
                >
                  {row.operatorName ?? "原账号"}
                </Button>
              ) : (
                "未关联账号"
              ),
          },
          {
            id: "identity",
            label: "当时的身份",
            render: (row) => (
              <span className="audit-identity">{auditIdentity(row)}</span>
            ),
          },
          {
            id: "action",
            label: "操作",
            render: (row) => auditActionName(row.action),
          },
          { id: "target", label: "对象", render: (row) => auditTarget(row) },
          {
            id: "result",
            label: "结果",
            render: (row) => {
              const result = auditResult(row);
              return (
                <span className={`audit-result audit-result-${result.tone}`}>
                  {result.label}
                </span>
              );
            },
          },
        ],
      }}
    />
  );
}

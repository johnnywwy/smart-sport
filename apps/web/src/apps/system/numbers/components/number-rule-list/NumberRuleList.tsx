import type { NumberRule } from "@smart-sport/contracts";
import { DataTable } from "../../../../../shared/components/data-table/DataTable";
import type { TableQuery } from "../../../../../shared/components/data-table/types";
import { numberTablePage, resetLabels } from "../../number-state";
import "./NumberRuleList.css";

export function NumberRuleList({
  identityId,
  rows,
  query,
  onQueryChange,
  status,
  onEdit,
}: {
  identityId: string;
  rows: NumberRule[];
  query: TableQuery;
  onQueryChange: (query: TableQuery) => void;
  status: { loading: boolean; error: boolean; onRetry: () => void };
  onEdit: (row: NumberRule) => void;
}) {
  const page = numberTablePage(rows, query);
  return (
    <DataTable
      scopeKey={identityId}
      config={{
        title: "编号规则",
        description: "各类编号的生成方式。",
        searchPlaceholder: "搜索对象或编号",
        permissions: [],
        filters: [
          {
            id: "object",
            label: "对象",
            options: rows.map((row) => ({ id: row.type, label: row.name })),
          },
        ],
        rowLabel: (row) => row.name,
        rowActions: [{ action: "update", label: "修改", onPress: onEdit }],
        columns: [
          {
            id: "name",
            label: "对象",
            required: true,
            sortable: true,
            render: (row) => <strong>{row.name}</strong>,
          },
          {
            id: "rule",
            label: "规则",
            render: (row) => `${row.prefix} + 年份 + ${row.digits} 位流水`,
          },
          {
            id: "example",
            label: "示例",
            render: (row) =>
              row.nextNumber ? (
                <span className="number-rule-example">{row.nextNumber}</span>
              ) : (
                <span className="number-rule-unavailable">
                  暂不可生成，请检查流水位数或系统时间
                </span>
              ),
          },
          {
            id: "reset",
            label: "重置周期",
            render: (row) => resetLabels[row.reset],
          },
        ],
      }}
      data={page}
      query={{ ...query, page: page.page }}
      onQueryChange={onQueryChange}
      status={status}
    />
  );
}

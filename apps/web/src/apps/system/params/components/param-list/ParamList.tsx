import type { SystemParam } from "@smart-sport/contracts";
import { DataTable } from "../../../../../shared/components/data-table/DataTable";
import type {
  DataTableProps,
  TablePage,
  TableQuery,
} from "../../../../../shared/components/data-table/types";
import {
  paramDescription,
  paramUpdatedAt,
  paramValueLabel,
} from "../../param-state";
import "./ParamList.css";
export function ParamList({
  identityId,
  data,
  query,
  onQueryChange,
  status,
  onEdit,
}: {
  identityId: string;
  data: TablePage<SystemParam>;
  query: TableQuery;
  onQueryChange: (query: TableQuery) => void;
  status: DataTableProps<SystemParam>["status"];
  onEdit: (row: SystemParam) => void;
}) {
  return (
    <DataTable
      scopeKey={identityId}
      config={{
        title: "系统参数",
        description: "全平台生效的规则数值。",
        searchPlaceholder: "参数名称",
        permissions: [],
        rowLabel: (row) => row.name,
        rowActions: [{ action: "update", label: "修改", onPress: onEdit }],
        columns: [
          {
            id: "name",
            label: "参数",
            required: true,
            sortable: true,
            render: (row) => <strong>{row.name}</strong>,
          },
          {
            id: "value",
            label: "当前值",
            render: (row) => (
              <span className="system-param-value">{paramValueLabel(row)}</span>
            ),
          },
          {
            id: "remark",
            label: "说明",
            render: (row) => (
              <span className="system-param-description">
                {paramDescription(row)}
              </span>
            ),
          },
          {
            id: "updatedAt",
            label: "最近修改",
            sortable: true,
            render: (row) => (
              <time dateTime={row.updatedAt}>
                {paramUpdatedAt(row.updatedAt)}
              </time>
            ),
          },
        ],
      }}
      data={data}
      query={query}
      onQueryChange={onQueryChange}
      {...(status ? { status } : {})}
    />
  );
}

import { Chip } from "@heroui/react";
import type { DictItem } from "@smart-sport/contracts";
import type { ReactNode } from "react";
import { DataTable } from "../../../../../shared/components/data-table/DataTable";
import type {
  DataTableProps,
  TablePage,
  TableQuery,
} from "../../../../../shared/components/data-table/types";
import type { DictType } from "../../dict-state";
import "./DictItemList.css";
export function DictItemList({
  identityId,
  type,
  sidebar,
  data,
  query,
  onQueryChange,
  status,
  actions,
}: {
  identityId: string;
  type: DictType | undefined;
  sidebar: ReactNode;
  data: TablePage<DictItem>;
  query: TableQuery;
  onQueryChange: (query: TableQuery) => void;
  status: DataTableProps<DictItem>["status"];
  actions: {
    view: (row: DictItem) => void;
    edit: (row: DictItem) => void;
    remove: (row: DictItem) => void;
    create: () => void;
  };
}) {
  const canCreate = type?.allowCustom && type.allowedActions.includes("create");
  return (
    <DataTable
      scopeKey={`${identityId}:${type?.code ?? "empty"}`}
      sidebar={sidebar}
      config={{
        title: "数据字典",
        description: "下拉选项的统一来源。",
        searchPlaceholder: "选项名称",
        permissions: canCreate ? ["system:dict:create"] : [],
        actions: canCreate
          ? [
              {
                id: "create",
                label: "新增选项",
                permission: "system:dict:create",
                onPress: actions.create,
              },
            ]
          : [],
        filters: [
          {
            id: "enabled",
            label: "状态",
            options: [
              { id: "true", label: "启用" },
              { id: "false", label: "停用" },
            ],
          },
        ],
        rowLabel: (row) => row.label,
        rowDetails: { label: "查看", onPress: actions.view },
        rowActions: [
          { action: "update", label: "编辑", onPress: actions.edit },
          {
            action: "delete",
            label: "删除",
            danger: true,
            opensDialog: true,
            onPress: actions.remove,
          },
        ],
        columns: [
          {
            id: "label",
            label: "选项名称",
            required: true,
            sortable: true,
            render: (row) => <strong>{row.label}</strong>,
          },
          {
            id: "description",
            label: "说明",
            render: (row) => (
              <span className="dict-item-description">
                {row.description || "—"}
              </span>
            ),
          },
          {
            id: "sort",
            label: "顺序",
            sortable: true,
            render: (row) => row.sort,
          },
          {
            id: "source",
            label: "来源",
            render: (row) => (
              <Chip size="sm" className="dict-item-source">
                {row.isSystem ? "系统内置" : "自定义"}
              </Chip>
            ),
          },
          {
            id: "enabled",
            label: "状态",
            render: (row) => (
              <Chip
                size="sm"
                className={`dict-item-status ${row.enabled ? "dict-item-enabled" : "dict-item-disabled"}`}
              >
                {row.enabled ? "启用" : "停用"}
              </Chip>
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

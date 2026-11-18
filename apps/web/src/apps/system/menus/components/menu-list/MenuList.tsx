import { Chip } from "@heroui/react";
import {
  identityTypeNames,
  type MenuOverride,
  type ModuleCode,
} from "@smart-sport/contracts";
import type { ReactNode } from "react";
import { DataTable } from "../../../../../shared/components/data-table/DataTable";
import type {
  DataTableProps,
  TablePage,
  TableQuery,
} from "../../../../../shared/components/data-table/types";
import "./MenuList.css";
export function MenuList({
  identityId,
  module,
  sidebar,
  data,
  query,
  onQueryChange,
  status,
  actions,
}: {
  identityId: string;
  module: ModuleCode;
  sidebar: ReactNode;
  data: TablePage<MenuOverride>;
  query: TableQuery;
  onQueryChange: (query: TableQuery) => void;
  status: DataTableProps<MenuOverride>["status"];
  actions: {
    busy: boolean;
    edit: (row: MenuOverride) => void;
    move: (
      row: MenuOverride,
      target: MenuOverride,
      position: "before" | "after",
    ) => void;
  };
}) {
  return (
    <DataTable
      scopeKey={`${identityId}:${module}`}
      sidebar={sidebar}
      data={data}
      query={query}
      onQueryChange={onQueryChange}
      {...(status ? { status } : {})}
      config={{
        title: "菜单设置",
        description: "调整菜单的显示名称、顺序和是否显示。",
        searchPlaceholder: "菜单名称",
        permissions: [],
        rowLabel: (row) => row.displayName,
        columns: [
          { id: "group", label: "分组", render: (row) => row.groupName },
          {
            id: "name",
            label: "菜单",
            required: true,
            render: (row) => <strong>{row.displayName}</strong>,
          },
          {
            id: "identities",
            label: "能看到的身份",
            render: (row) => (
              <span className="menu-identity-types">
                {row.identityTypes
                  .map((type) => identityTypeNames[type])
                  .join("、")}
              </span>
            ),
          },
          { id: "sort", label: "顺序", render: (row) => row.sort },
          {
            id: "status",
            label: "状态",
            render: (row) => (
              <Chip
                size="sm"
                variant="soft"
                color={row.hidden ? "default" : "success"}
              >
                {row.hidden ? "隐藏" : "显示"}
              </Chip>
            ),
          },
        ],
        reorder: {
          requiredAction: "update",
          disabled: actions.busy,
          canDrop: (source, target) =>
            source.module === target.module &&
            source.groupKey === target.groupKey,
          onReorder: actions.move,
        },
        rowActions: [
          { action: "update", label: "编辑", onPress: actions.edit },
        ],
      }}
    />
  );
}

import type {
  Member,
  MemberOptions,
  PermissionCode,
} from "@smart-sport/contracts";
import type { ReactNode } from "react";
import { DataTable } from "../../../../../shared/components/data-table/DataTable";
import type {
  DataTableProps,
  TableQuery,
} from "../../../../../shared/components/data-table/types";
import { memberColumns } from "../../columns";
import { memberDepartmentPath } from "../../member-state";
import type { MemberBatchDraft } from "../batch-members-dialog/BatchMembersDialog";
import "./MemberList.css";
export function MemberList({
  selectedId,
  identityId,
  canMoveMembers,
  departmentName,
  departmentMode,
  canAddToDepartment,
  options,
  revision,
  list,
  query,
  onQueryChange,
  onSelect,
  renderVisible,
  onCreate,
  onStatus,
  onBatch,
  onAdd,
}: {
  identityId: string;
  renderVisible: (row: Member) => ReactNode;
  selectedId: string | undefined;
  canMoveMembers: boolean;
  departmentName: string | undefined;
  departmentMode: boolean;
  canAddToDepartment: boolean;
  options: MemberOptions | undefined;
  revision: number;
  list: Pick<DataTableProps<Member>, "data" | "status">;
  query: TableQuery;
  onQueryChange: (query: TableQuery) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onStatus: (row: Member) => void;
  onBatch: (draft: MemberBatchDraft) => void;
  onAdd: () => void;
}) {
  const permissions: PermissionCode[] = [
    "org:member:view",
    ...(options?.allowedActions.includes("create")
      ? ["org:member:create" as const]
      : []),
    ...(canMoveMembers ? ["org:member:update" as const] : []),
  ];
  return (
    <div className="member-list">
      <DataTable
        scopeKey={`${identityId}:${departmentName ?? "all"}`}
        data={list.data}
        {...(list.status ? { status: list.status } : {})}
        query={query}
        onQueryChange={onQueryChange}
        config={{
          title: departmentMode ? "部门成员" : "成员账号",
          description: departmentMode
            ? `${departmentName ?? "本组织"}的成员，可按需包含下级部门。实际可见按学校列表的查看权限计算。`
            : "给本组织的每个账号分配部门和角色。实际可见按学校列表的查看权限计算，可在详情中切换操作。",
          searchPlaceholder: "姓名或账号",
          permissions,
          selectionRevision: revision,
          activeRowId: selectedId,
          actions:
            departmentMode && canAddToDepartment
              ? [
                  {
                    id: "create",
                    label: "添加已有成员",
                    permission: "org:member:update",
                    onPress: onAdd,
                  },
                ]
              : [
                  {
                    id: "create",
                    label: "新增成员",
                    permission: "org:member:create",
                    onPress: onCreate,
                  },
                ],
          filters: [
            ...(!departmentMode
              ? [
                  {
                    id: "department",
                    label: "全部部门",
                    options: [
                      { id: "unassigned", label: "未分配部门" },
                      ...(options?.departments ?? []).map((d) => ({
                        id: d.id,
                        label: memberDepartmentPath(
                          options?.departments ?? [],
                          d.id,
                        ),
                      })),
                    ],
                  },
                ]
              : [
                  {
                    id: "descendants",
                    label: "仅直属成员",
                    options: [{ id: "true", label: "包含下级部门" }],
                  },
                ]),
            {
              id: "status",
              label: "全部状态",
              options: [
                { id: "1", label: "启用" },
                { id: "0", label: "停用" },
              ],
            },
          ],
          columns: memberColumns(onSelect, renderVisible),
          rowLabel: (row) => row.realName,
          rowActions: [
            {
              action: "update",
              label: "分配部门与角色",
              onPress: (row) => onSelect(row.id),
            },
            {
              action: "disable",
              label: "停用",
              onPress: onStatus,
            },
            { action: "enable", label: "启用", onPress: onStatus },
          ],
          batchActions: [
            {
              id: "department",
              label: "批量移部门",
              permission: "org:member:update",
              requiredAction: "update",
              onPress: (rows) => onBatch({ kind: "department", rows }),
            },
            {
              id: "roles",
              label: "批量设角色",
              permission: "org:member:update",
              requiredAction: "assignRoles",
              onPress: (rows) => onBatch({ kind: "roles", rows }),
            },
          ],
        }}
      />
    </div>
  );
}

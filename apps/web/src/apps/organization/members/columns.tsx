import { Button, Chip } from "@heroui/react";
import type { Member } from "@smart-sport/contracts";
import type { ReactNode } from "react";
import type { TableColumn } from "../../../shared/components/data-table/types";
export const memberColumns = (
  onSelect: (id: string) => void,
  renderVisible: (row: Member) => ReactNode,
): readonly TableColumn<Member>[] => [
  {
    id: "realName",
    label: "姓名",
    sortable: true,
    render: (row) => (
      <Button
        variant="ghost"
        className="member-name-button"
        onPress={() => onSelect(row.id)}
      >
        {row.realName}
      </Button>
    ),
  },
  {
    id: "username",
    label: "登录账号",
    render: (row) => row.username,
  },
  {
    id: "department",
    label: "部门",
    render: (row) =>
      row.departmentName ?? (
        <Chip size="sm" className="member-warning-chip">
          未分配部门
        </Chip>
      ),
  },
  {
    id: "roles",
    label: "角色",
    render: (row) => (
      <div className="member-role-chips">
        {row.roles.length ? (
          row.roles.map((role) => (
            <Chip key={role.id} size="sm" variant="soft">
              {role.name}
            </Chip>
          ))
        ) : (
          <Chip size="sm" className="member-danger-chip">
            未分配角色
          </Chip>
        )}
      </div>
    ),
  },
  { id: "visible", label: "实际可见", render: renderVisible },
  {
    id: "status",
    label: "状态",
    render: (row) => (
      <Chip
        size="sm"
        className={
          row.status === 1 ? "member-enabled-chip" : "member-disabled-chip"
        }
      >
        {row.status === 1 ? "启用" : "停用"}
        {row.accountStatus === 0 ? " · 账号停用" : ""}
      </Chip>
    ),
  },
];

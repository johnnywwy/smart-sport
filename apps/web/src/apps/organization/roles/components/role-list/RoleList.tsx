import { Button, Chip } from "@heroui/react";
import type { PermissionCode, RoleSummary } from "@smart-sport/contracts";
import { Can } from "../../../../../shared/components/can/Can";
import "./RoleList.css";

export function RoleList({
  roles,
  selected,
  disabled,
  permissions,
  onSelect,
  onCreate,
}: {
  roles: RoleSummary[];
  selected: string | undefined;
  disabled: boolean;
  permissions: readonly PermissionCode[];
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="organization-role-list">
      <h2>第 1 步 · 选角色</h2>
      <div className="organization-role-items">
        {roles.map((role) => (
          <Button
            key={role.id}
            variant="ghost"
            className="organization-role-item"
            aria-pressed={selected === role.id}
            isDisabled={disabled}
            onPress={() => onSelect(role.id)}
          >
            <span>{role.name}</span>
            <Chip size="sm">{role.kind === "preset" ? "内置" : "自定义"}</Chip>
          </Button>
        ))}
      </div>
      <Can perm="org:role:create" permissions={permissions}>
        <Button
          variant="secondary"
          className="organization-role-create"
          isDisabled={disabled}
          onPress={onCreate}
        >
          新建角色
        </Button>
        <p>新建时先选一个现有内置角色作为起点，只改不一样的地方。</p>
      </Can>
    </aside>
  );
}

import { Checkbox, Chip, Label } from "@heroui/react";
import type { AssignableMemberRole, Member } from "@smart-sport/contracts";
import { scopeLabels } from "../../../../../shared/components/role-permissions/permission-state";
import "./MemberRolePicker.css";
export function MemberRolePicker({
  roles,
  selected,
  onChange,
  disabled = false,
  existing = [],
}: {
  roles: readonly AssignableMemberRole[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  existing?: Member["roles"];
}) {
  return (
    <div className="member-role-picker">
      {existing
        .filter((r) => !roles.some((option) => option.id === r.id))
        .map((r) => (
          <div className="member-role-retained" key={r.id}>
            <Chip size="sm">{r.name}</Chip>
            <span>当前角色保留，超出可分配范围。</span>
          </div>
        ))}
      {roles.map((role) => (
        <Checkbox
          key={role.id}
          isSelected={selected.includes(role.id)}
          isDisabled={disabled}
          className="member-role-option"
          onChange={(checked) =>
            onChange(
              checked
                ? [...selected, role.id]
                : selected.filter((id) => id !== role.id),
            )
          }
        >
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Label>
              <strong>{role.name}</strong>
              <span>{role.remark || scopeLabels[role.dataScope]}</span>
            </Label>
          </Checkbox.Content>
        </Checkbox>
      ))}
      {!roles.length && (
        <p className="member-role-empty">当前没有可分配的角色。</p>
      )}
    </div>
  );
}

import { Button, Chip, Tabs } from "@heroui/react";
import type { IdentityType } from "@smart-sport/contracts";
import { identityLabels, type PresetRole } from "../../template-state";
import "./RoleSelector.css";

export function RoleSelector({
  roles,
  selected,
  type,
  disabled,
  onType,
  onSelect,
}: {
  roles: PresetRole[];
  selected: string | undefined;
  type: IdentityType;
  disabled: boolean;
  onType: (type: IdentityType) => void;
  onSelect: (role: PresetRole) => void;
}) {
  const visible = roles.filter((role) => role.identityType === type);
  return (
    <aside className="role-selector">
      <h2>第 1 步 · 选角色</h2>
      <p>先选组织类型（每类组织有自己的一套角色）</p>
      <Tabs
        selectedKey={type}
        onSelectionChange={(key) => onType(key as IdentityType)}
        isDisabled={disabled}
        className="role-type-tabs"
      >
        <Tabs.List aria-label="组织类型">
          {Object.entries(identityLabels).map(([key, label]) => (
            <Tabs.Tab key={key} id={key} data-identity={key}>
              {label}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <p>
        {identityLabels[type]}下的角色（{visible.length} 个）
      </p>
      <div className="role-selector-list">
        {visible.map((role) => (
          <Button
            key={role.id}
            variant="ghost"
            aria-pressed={selected === role.id}
            isDisabled={disabled}
            className="role-selector-item"
            onPress={() => onSelect(role)}
          >
            <span>
              <strong>{role.name}</strong>
              {role.modified && <Chip size="sm">已改</Chip>}
            </span>
            <small>
              {role.usage.organizationCount} 个组织 · {role.usage.userCount}{" "}
              人使用
            </small>
          </Button>
        ))}
      </div>
      {!visible.length && <p role="status">该类型暂无内置角色。</p>}
      <p className="role-selector-note">
        内置角色由平台统一维护。各组织可基于内置角色另存为自定义角色。
      </p>
    </aside>
  );
}

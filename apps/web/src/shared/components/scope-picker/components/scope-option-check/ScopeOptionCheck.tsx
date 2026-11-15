import { Checkbox, Label } from "@heroui/react";
import type { ScopeOption } from "@smart-sport/contracts";
import "./ScopeOptionCheck.css";

export function ScopeOptionCheck({
  item,
  selected,
  coveredBy,
  indeterminate = false,
  disabled,
  onChange,
}: {
  item: ScopeOption;
  selected: boolean;
  coveredBy?: string | undefined;
  indeterminate?: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox
      isSelected={selected || !!coveredBy}
      isIndeterminate={indeterminate && !selected && !coveredBy}
      isDisabled={disabled || !item.available || !!coveredBy}
      onChange={onChange}
      className="scope-option-check"
    >
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Label>
          <span>{item.available ? item.name : "已失效的负责范围"}</span>
          {coveredBy && <small>已包含在{coveredBy}中</small>}
          {!item.available && <small>已失效</small>}
        </Label>
      </Checkbox.Content>
    </Checkbox>
  );
}

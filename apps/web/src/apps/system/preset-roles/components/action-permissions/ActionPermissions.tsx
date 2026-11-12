import { Checkbox, CheckboxGroup, Label } from "@heroui/react";
import type { Action } from "@smart-sport/contracts";
import { actionLabels } from "../../template-state";
import "./ActionPermissions.css";

export function ActionPermissions({
  name,
  actions,
  selected,
  disabled,
  onChange,
}: {
  name: string;
  actions: readonly Action[];
  selected: readonly Action[];
  disabled: boolean;
  onChange: (actions: Action[]) => void;
}) {
  return (
    <CheckboxGroup
      aria-label={name}
      className="template-action-permissions"
      value={[...selected]}
      isDisabled={disabled}
      onChange={(values) =>
        onChange(actions.filter((action) => values.includes(action)))
      }
    >
      {actions.map((action) => (
        <Checkbox key={action} value={action}>
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Label>{actionLabels[action]}</Label>
          </Checkbox.Content>
        </Checkbox>
      ))}
    </CheckboxGroup>
  );
}

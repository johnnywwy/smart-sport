import { Checkbox, CheckboxGroup, Label } from "@heroui/react";
import type { Action } from "@smart-sport/contracts";
import { actionLabels } from "../permission-state";
import "./ActionPermissions.css";

export function ActionPermissions({
  name,
  actions,
  selected,
  disabled,
  grantableActions,
  onChange,
}: {
  name: string;
  actions: readonly Action[];
  selected: readonly Action[];
  disabled: boolean;
  grantableActions?: readonly Action[] | undefined;
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
        <Checkbox
          key={action}
          value={action}
          isDisabled={
            disabled ||
            (grantableActions !== undefined &&
              !selected.includes(action) &&
              !grantableActions.includes(action))
          }
        >
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

import { Button, Chip } from "@heroui/react";
import type { Action, FeatureGrant } from "@smart-sport/contracts";
import { ActionPermissions } from "../action-permissions/ActionPermissions";
import {
  declaredActions,
  type PermissionRole,
  previewActions,
  sameGrant,
} from "../permission-state";
import "./GrantRow.css";

export function GrantRow({
  feature,
  grant,
  disabled,
  canReset,
  onChange,
  onReset,
  modified,
  availableActions,
  selectedActions,
}: {
  feature: PermissionRole["grants"][number];
  grant: FeatureGrant;
  disabled: boolean;
  canReset: boolean;
  onChange: (grant: FeatureGrant) => void;
  onReset?: (() => void) | undefined;
  modified?: boolean;
  availableActions?: readonly Action[];
  selectedActions?: readonly Action[];
}) {
  const actions =
    availableActions ?? declaredActions(feature.app, feature.feature);
  const selected =
    selectedActions ?? previewActions(feature.app, feature.feature, grant);
  return (
    <div className="template-grant-row">
      <div className="template-grant-main">
        <span className="template-grant-name">
          {feature.featureName}
          {(modified ?? !sameGrant(grant, feature.defaultGrant)) && (
            <Chip size="sm">已改</Chip>
          )}
        </span>
        <ActionPermissions
          name={`${feature.featureName}按钮权限`}
          actions={actions}
          selected={selected}
          disabled={disabled}
          onChange={(actions) => onChange({ level: "custom", actions })}
        />
      </div>
      {feature.modified && canReset && onReset && (
        <Button
          variant="ghost"
          size="sm"
          className="template-feature-reset"
          isDisabled={disabled || !canReset}
          onPress={onReset}
        >
          恢复此项默认
        </Button>
      )}
    </div>
  );
}

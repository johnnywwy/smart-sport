import type { Action, PresetFeatureGrant } from "@smart-sport/contracts";
import { GrantRow } from "../grant-row/GrantRow";
import {
  applyMenuGrant,
  type ConfigurationItem,
  declaredActions,
  type PermissionValues,
  previewActions,
  sameGrant,
} from "../permission-state";

export function MenuGrantRow({
  item,
  values,
  disabled,
  canReset,
  onChange,
  onReset,
  canGrant,
}: {
  item: ConfigurationItem;
  values: PermissionValues;
  disabled: boolean;
  canReset: boolean;
  onChange: (grants: PresetFeatureGrant[]) => void;
  onReset: (feature: { app: string; feature: string }, name: string) => void;
  canGrant?:
    | ((app: string, feature: string, action: Action) => boolean)
    | undefined;
}) {
  const first = item.features[0];
  if (!first) return null;
  const current = (feature: typeof first) =>
    values.grants.find(
      (entry) => entry.app === feature.app && entry.feature === feature.feature,
    )?.grant ?? { level: "none" as const };
  const firstGrant = current(first);
  const uniform = item.features.every((feature) =>
    sameGrant(current(feature), firstGrant),
  );
  const modified = item.features.some(
    (feature) => !sameGrant(current(feature), feature.defaultGrant),
  );
  const actions = [
    ...new Set(
      item.features.flatMap((feature) => [
        ...declaredActions(feature.app, feature.feature),
      ]),
    ),
  ];
  const selected = [
    ...new Set(
      item.features.flatMap((feature) =>
        previewActions(feature.app, feature.feature, current(feature)),
      ),
    ),
  ];
  const update = (grant: PresetFeatureGrant["grant"]) =>
    onChange(applyMenuGrant(values, item.features, grant));
  return (
    <GrantRow
      feature={{ ...first, featureName: item.name }}
      grant={uniform ? firstGrant : { level: "custom", actions: selected }}
      modified={modified}
      disabled={disabled}
      canReset={canReset}
      onChange={update}
      availableActions={actions}
      selectedActions={selected}
      grantableActions={
        canGrant
          ? actions.filter((action) =>
              item.features.every(
                (feature) =>
                  !declaredActions(feature.app, feature.feature).includes(
                    action,
                  ) || canGrant(feature.app, feature.feature, action),
              ),
            )
          : undefined
      }
      onReset={
        item.features.length === 1 ? () => onReset(first, item.name) : undefined
      }
    />
  );
}

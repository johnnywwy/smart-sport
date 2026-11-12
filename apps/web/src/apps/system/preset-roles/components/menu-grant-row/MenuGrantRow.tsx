import type {
  PresetFeatureGrant,
  SavePresetRole,
} from "@smart-sport/contracts";
import {
  applyMenuGrant,
  type ConfigurationItem,
  declaredActions,
  previewActions,
  sameGrant,
} from "../../template-state";
import { GrantRow } from "../grant-row/GrantRow";

export function MenuGrantRow({
  item,
  values,
  disabled,
  canReset,
  onChange,
  onReset,
}: {
  item: ConfigurationItem;
  values: SavePresetRole;
  disabled: boolean;
  canReset: boolean;
  onChange: (grants: PresetFeatureGrant[]) => void;
  onReset: (feature: { app: string; feature: string }, name: string) => void;
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
      onReset={
        item.features.length === 1 ? () => onReset(first, item.name) : undefined
      }
    />
  );
}

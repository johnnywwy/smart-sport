import type { SavePresetRole } from "@smart-sport/contracts";
import {
  actionLabels,
  configurationGroups,
  type PresetRole,
  previewActions,
} from "./template-state";

export type PermissionPreviewNode = {
  key: string;
  name: string;
  children: PermissionPreviewNode[];
};

/** 与配置区使用同一份菜单声明，只预览具有查询权限的菜单及实际动作。 */
export function permissionPreviewTree(
  role: PresetRole,
  values: SavePresetRole,
): PermissionPreviewNode[] {
  return configurationGroups(role).flatMap((group) => {
    const menus = group.items.flatMap((menu) => {
      const key = `${group.key}:${menu.key}`;
      const visible = menu.features.flatMap((feature) => {
        const current = values.grants.find(
          (entry) =>
            entry.app === feature.app && entry.feature === feature.feature,
        );
        if (!current) return [];
        const actions = previewActions(
          current.app,
          current.feature,
          current.grant,
        );
        return actions.includes("view") ? [{ feature, actions }] : [];
      });
      if (!visible.length) return [];
      const actions = [...new Set(visible.flatMap((item) => item.actions))];
      return [
        {
          key,
          name: menu.name,
          children:
            menu.key === "classes"
              ? visible.map(({ feature, actions }) => ({
                  key: `${key}:${feature.app}:${feature.feature}`,
                  name: feature.featureName,
                  children: actions.map((action) => ({
                    key: `${key}:${feature.app}:${feature.feature}:${action}`,
                    name: actionLabels[action],
                    children: [],
                  })),
                }))
              : actions.map((action) => ({
                  key: `${key}:${action}`,
                  name: actionLabels[action],
                  children: [],
                })),
        },
      ];
    });
    return menus.length
      ? [{ key: group.key, name: group.name, children: menus }]
      : [];
  });
}

import {
  type MenuOverride,
  menuOverrideDefinitions,
  menuOverrideSchema,
} from "@smart-sport/contracts";
import type { IdentityContext } from "../identity-context/index.js";
import type { MenuManagementRepository } from "./menu-management.repository.js";

type Rows = Awaited<ReturnType<MenuManagementRepository["rows"]>>;
export function managedMenus(
  rows: Rows,
  actor: IdentityContext,
): MenuOverride[] {
  return menuOverrideDefinitions.flatMap((definition) => {
    const sources = definition.sources.map((ref) =>
      rows.find(
        (row) => row.menu.appCode === ref.app && row.menu.key === ref.key,
      ),
    );
    if (sources.some((row) => !row)) return [];
    const overrides = sources.flatMap((row) =>
      row?.override ? [row.override] : [],
    );
    return [
      menuOverrideSchema.parse({
        id: `${definition.module}:${definition.key}`,
        module: definition.module,
        key: definition.key,
        name: definition.name,
        groupKey: definition.groupKey,
        groupName: definition.groupName,
        groupSort: definition.groupSort,
        identityTypes: definition.identityTypes,
        displayName:
          overrides.find((row) => row.displayName !== null)?.displayName ??
          definition.name,
        sort:
          overrides.find((row) => row.sort !== null)?.sort ?? definition.sort,
        hidden: sources.every((row) => row?.override?.hidden === true),
        // 一个模块菜单可能关联多个目录行，累加版本能发现任一来源的并发变化。
        version: overrides.reduce((version, row) => version + row.version, 0),
        allowedActions:
          actor.identityType === "company" &&
          actor.permissions.has("system:menu:update")
            ? ["update"]
            : [],
      }),
    ];
  });
}

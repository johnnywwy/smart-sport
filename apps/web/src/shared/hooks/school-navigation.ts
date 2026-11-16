import {
  type ModuleMenuDefinition,
  moduleDefinitions,
  scopePermissionSchema,
} from "@smart-sport/contracts";
import type { TableQuery } from "../components/data-table/types";

const schoolMenus = new Set([
  "colleges",
  "classes",
  "students",
  "teachers",
  "rollover",
  "transfers",
  "agent-grants",
]);
/** 引用真实导航声明，不另造菜单或权限。 */
export function schoolMenuPermissions(key: string) {
  if (!schoolMenus.has(key)) return [];
  const menu = moduleDefinitions
    .find((item) => item.code === "base")
    ?.groups.flatMap<ModuleMenuDefinition>((group) => group.menus)
    .find((item) => item.key === key);
  return (menu?.features ?? []).flatMap((feature) => {
    const parsed = scopePermissionSchema.safeParse(
      `${feature.app}:${feature.feature}:view`,
    );
    return parsed.success ? [parsed.data] : [];
  });
}
export const initialSchoolQuery = (): TableQuery => ({
  page: 1,
  pageSize: 20,
  keyword: "",
  filters: {},
  deleted: false,
});

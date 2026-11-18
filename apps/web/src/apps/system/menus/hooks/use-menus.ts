import type {
  MenuOverride,
  MenuOverrideFields,
  ModuleCode,
} from "@smart-sport/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { TableQuery } from "../../../../shared/components/data-table/types";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";
import { useApiEvents } from "../../../../shared/stores/api-events";
import { menuChange, reorderedMenus } from "../menu-state";
import { allMenus, menusOptions, saveMenus } from "./menu-requests";
export function useMenus(
  identityId: string,
  module: ModuleCode,
  query: TableQuery,
) {
  const items = useQuery(menusOptions(identityId, module, query)),
    client = useQueryClient();
  const [moving, setMoving] = useState(false),
    locked = useRef(false);
  const refresh = () =>
    Promise.all(
      ["menu-overrides", "module-menus", "available-modules"].map((resource) =>
        client.invalidateQueries({ queryKey: [identityId, resource] }),
      ),
    );
  return {
    items,
    moving,
    save: async (
      row: MenuOverride,
      values: MenuOverrideFields,
      context: FormSubmissionContext,
    ) => {
      try {
        await saveMenus({ items: [menuChange(row, values)] }, context);
        useApiEvents
          .getState()
          .notifySuccess(`已保存菜单“${values.displayName}”。`);
      } finally {
        await refresh();
      }
    },
    reload: async (row: MenuOverride) => {
      const rows = await allMenus(row.module, new AbortController().signal);
      const found = rows.find((item) => item.id === row.id);
      if (!found) throw new Error("该菜单已下线，请关闭后刷新页面。");
      return found;
    },
    move: async (
      row: MenuOverride,
      target: MenuOverride,
      position: "before" | "after",
    ) => {
      if (locked.current) return;
      locked.current = true;
      setMoving(true);
      try {
        const context = {
          signal: new AbortController().signal,
          idempotencyKey: crypto.randomUUID(),
        };
        const rows = await allMenus(row.module, context.signal),
          fresh = rows.find((item) => item.id === row.id);
        if (
          !fresh ||
          fresh.version !== row.version ||
          rows.find((item) => item.id === target.id)?.version !== target.version
        )
          throw new Error("菜单已被他人修改，请刷新后重试。");
        const changes = reorderedMenus(rows, row, target, position);
        if (!changes.length) return;
        await saveMenus({ items: changes }, context);
        useApiEvents
          .getState()
          .notifySuccess(`已调整“${row.displayName}”的顺序。`);
      } catch (error) {
        useApiEvents
          .getState()
          .notifyError(
            error instanceof Error ? error.message : "调整顺序失败，请重试。",
          );
      } finally {
        await refresh();
        locked.current = false;
        setMoving(false);
      }
    },
  };
}

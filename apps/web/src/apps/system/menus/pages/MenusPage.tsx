import type { MenuOverride, ModuleCode } from "@smart-sport/contracts";
import { useState } from "react";
import { EditMenuDialog } from "../components/edit-menu-dialog/EditMenuDialog";
import { MenuList } from "../components/menu-list/MenuList";
import { ModuleList } from "../components/module-list/ModuleList";
import { useMenus } from "../hooks/use-menus";
import { initialMenuQuery } from "../menu-state";
import "./MenusPage.css";
export function MenusPage({ identityId }: { identityId: string }) {
  const [module, setModule] = useState<ModuleCode>("base"),
    [query, setQuery] = useState(initialMenuQuery),
    [editing, setEditing] = useState<MenuOverride | null>(null);
  const data = useMenus(identityId, module, query);
  return (
    <div className="menus-page">
      <MenuList
        identityId={identityId}
        module={module}
        sidebar={
          <ModuleList
            selected={module}
            onSelect={(module) => {
              setModule(module);
              setQuery({ ...initialMenuQuery, pageSize: query.pageSize });
              setEditing(null);
            }}
          />
        }
        data={
          (!data.items.isError && data.items.data) || {
            items: [],
            total: 0,
            page: query.page,
            pageSize: query.pageSize,
          }
        }
        query={query}
        onQueryChange={setQuery}
        status={{
          loading: data.items.isPending,
          error: data.items.isError,
          onRetry: () => void data.items.refetch(),
        }}
        actions={{
          busy: data.moving,
          edit: setEditing,
          move: (row, target, position) =>
            void data.move(row, target, position),
        }}
      />
      <p className="menus-page-note">
        菜单和按钮由程序定义，这里不能新增或删除。身份列表示适用类型；实际能看到哪些菜单，由“角色模板”和各组织的“角色权限”决定。拖动左侧手柄可在同一分组内排序，支持键盘操作；排序会自动保存。
      </p>
      {editing && (
        <EditMenuDialog
          key={`${identityId}:${editing.id}`}
          identityId={identityId}
          row={editing}
          onClose={() => setEditing(null)}
          onSave={(values, context) => data.save(editing, values, context)}
          onReload={() => data.reload(editing)}
        />
      )}
    </div>
  );
}

import { AppLayout } from "@heroui-pro/react/app-layout";
import type {
  AvailableModule,
  IdentitySummary,
  ModuleMenuGroup,
} from "@smart-sport/contracts";
import { type ReactNode, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { usePreferences } from "../../shared/stores/preferences";
import { useWorkspaceTabs } from "../../shared/stores/workspace-tabs";
import { ModuleHeader } from "./components/module-header/ModuleHeader";
import { ModuleSidebar } from "./components/module-sidebar/ModuleSidebar";
import { WorkspaceTabs } from "./components/workspace-tabs/WorkspaceTabs";
import "./ModuleLayout.css";
export function ModuleLayout({
  module,
  modules,
  groups,
  identity,
  pageName,
  children,
}: {
  module: AvailableModule;
  modules: AvailableModule[];
  groups: ModuleMenuGroup[];
  identity: IdentitySummary;
  pageName: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { sidebarOpen, setSidebarOpen } = usePreferences();
  const scope = `${identity.id}:${module.code}`;
  const home = `/m/${module.code}/workbench`;
  const tabs = useWorkspaceTabs((state) => state.tabs[scope]);
  useEffect(() => {
    if (
      pathname !== home &&
      groups.some((group) =>
        group.children.some(
          (menu) => `/m/${module.code}${menu.path}` === pathname,
        ),
      )
    )
      useWorkspaceTabs
        .getState()
        .open(scope, { path: pathname, name: pageName });
  }, [pathname, home, scope, pageName, groups, module.code]);
  const visible = (tabs ?? []).filter((tab) =>
    groups.some((group) =>
      group.children.some(
        (menu) => `/m/${module.code}${menu.path}` === tab.path,
      ),
    ),
  );
  return (
    <AppLayout
      className="module-layout"
      navigate={navigate}
      sidebarOpen={sidebarOpen}
      onSidebarOpenChange={setSidebarOpen}
      sidebar={
        <ModuleSidebar
          module={module}
          modules={modules}
          groups={groups}
          pathname={pathname}
        />
      }
      navbar={
        <ModuleHeader
          moduleName={module.name}
          pageName={pageName}
          identity={identity}
        />
      }
    >
      <div className="module-workspace">
        <WorkspaceTabs
          home={home}
          tabs={visible}
          current={pathname}
          onClose={(path) => {
            useWorkspaceTabs.getState().close(scope, path);
            if (path === pathname) navigate(home);
          }}
          onCloseOthers={() =>
            useWorkspaceTabs.getState().closeOthers(scope, pathname)
          }
        />
        <div className="module-content">{children}</div>
      </div>
    </AppLayout>
  );
}

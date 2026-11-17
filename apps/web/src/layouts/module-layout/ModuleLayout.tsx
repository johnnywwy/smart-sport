import { AppLayout } from "@heroui-pro/react/app-layout";
import type {
  AvailableModule,
  IdentitySummary,
  ModuleMenuGroup,
} from "@smart-sport/contracts";
import { type ReactNode, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAcademicSelection } from "../../shared/hooks/use-academic-selection";
import { usePreferences } from "../../shared/stores/preferences";
import {
  pathAfterClosingTab,
  useWorkspaceTabs,
} from "../../shared/stores/workspace-tabs";
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
  contentPadding = "default",
}: {
  module: AvailableModule;
  modules: AvailableModule[];
  groups: ModuleMenuGroup[];
  identity: IdentitySummary;
  pageName: string;
  children: ReactNode;
  contentPadding?: "default" | "compact";
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { sidebarOpen, setSidebarOpen } = usePreferences();
  const academic = useAcademicSelection(identity.id);
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
      scrollMode="content"
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
          academic={academic}
        />
      }
    >
      <WorkspaceTabs
        home={home}
        tabs={visible}
        current={pathname}
        onClose={(path) => {
          useWorkspaceTabs.getState().close(scope, path);
          if (path === pathname)
            navigate(pathAfterClosingTab(visible, path, pathname, home));
        }}
      />
      <div className="module-workspace">
        <div
          className={`module-content${contentPadding === "compact" ? " module-content-compact" : ""}`}
        >
          {children}
        </div>
      </div>
    </AppLayout>
  );
}

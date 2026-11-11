import { AppLayout } from "@heroui-pro/react/app-layout";
import { Outlet, useLocation, useNavigate } from "react-router";
import { usePreferences } from "../../shared/stores/preferences";
import { AppHeader } from "./components/app-header/AppHeader";
import { AppSidebar } from "./components/app-sidebar/AppSidebar";

export function AdminLayout() {
  const { dark, sidebarOpen, toggleTheme, setSidebarOpen } = usePreferences();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isWorkspace = pathname === "/preview/workspace";
  return (
    <AppLayout
      navigate={navigate}
      sidebarOpen={sidebarOpen}
      onSidebarOpenChange={setSidebarOpen}
      sidebar={isWorkspace ? <AppSidebar /> : null}
      navbar={
        <AppHeader
          showSidebarTrigger={isWorkspace}
          dark={dark}
          onToggleTheme={toggleTheme}
        />
      }
    >
      <Outlet />
    </AppLayout>
  );
}

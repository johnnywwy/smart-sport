import { Navigate, useNavigate } from "react-router";
import { PortalLayout } from "../../layouts/portal-layout/PortalLayout";
import { NavigationState } from "../../shared/components/navigation-state/NavigationState";
import { useAvailableModules } from "../../shared/hooks/use-modules";
import { useSession } from "../../shared/stores/session";
import { ModuleGrid } from "./components/module-grid/ModuleGrid";
import "./ModulesPage.css";
export function ModulesPage() {
  const token = useSession((state) => state.accessToken);
  const identity = useSession((state) => state.currentIdentity);
  const modules = useAvailableModules();
  const navigate = useNavigate();
  if (!token) return <Navigate to="/login" replace />;
  if (!identity) return <Navigate to="/select-org" replace />;
  if (modules.data?.length === 1)
    return <Navigate to={`/m/${modules.data[0]?.code}/workbench`} replace />;
  return (
    <PortalLayout identity={identity}>
      <main className="modules-page">
        <header className="modules-introduction">
          <h1>选择模块</h1>
          <p>进入后，左侧是这个模块的菜单。</p>
        </header>
        {modules.isPending ? (
          <NavigationState state="loading" />
        ) : modules.isError ? (
          <NavigationState
            state="error"
            onRetry={() => void modules.refetch()}
          />
        ) : !modules.data.length ? (
          <NavigationState state="empty" />
        ) : (
          <ModuleGrid
            modules={modules.data}
            onOpen={(module) => navigate(`/m/${module.code}/workbench`)}
          />
        )}
      </main>
    </PortalLayout>
  );
}

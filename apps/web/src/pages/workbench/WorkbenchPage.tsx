import { moduleCodeSchema } from "@smart-sport/contracts";
import { Navigate, useLocation, useParams } from "react-router";
import { ModuleLayout } from "../../layouts/module-layout/ModuleLayout";
import { NavigationState } from "../../shared/components/navigation-state/NavigationState";
import {
  useAvailableModules,
  useModuleMenus,
} from "../../shared/hooks/use-modules";
import { useSession } from "../../shared/stores/session";
import { PortalKpiGroup } from "../portal/components/portal-kpi-group/PortalKpiGroup";
import { RecentTodos } from "../portal/components/recent-todos/RecentTodos";
import { WelcomePanel } from "../portal/components/welcome-panel/WelcomePanel";
import { WorkbenchRecentVisits } from "./components/workbench-recent-visits/WorkbenchRecentVisits";
import "./WorkbenchPage.css";
export function WorkbenchPage() {
  const { moduleCode, "*": page } = useParams();
  const parsed = moduleCodeSchema.safeParse(moduleCode);
  const identity = useSession((state) => state.currentIdentity);
  const modules = useAvailableModules();
  const menus = useModuleMenus(parsed.success ? parsed.data : undefined);
  const { pathname } = useLocation();
  if (!identity) return <Navigate to="/login" replace />;
  if (modules.isPending || (parsed.success && menus.isPending))
    return <NavigationState state="loading" />;
  if (modules.isError || menus.isError)
    return (
      <NavigationState
        state="error"
        onRetry={() => {
          void modules.refetch();
          void menus.refetch();
        }}
      />
    );
  const module = modules.data.find((item) => item.code === moduleCode);
  if (!parsed.success || !module) return <Navigate to="/modules" replace />;
  if (!page) return <Navigate to={`/m/${module.code}/workbench`} replace />;
  const selected = menus.data
    ?.flatMap((group) => group.children)
    .find((menu) => `/m/${module.code}${menu.path}` === pathname);
  const home = page === "workbench";
  return (
    <ModuleLayout
      module={module}
      modules={modules.data}
      groups={menus.data ?? []}
      identity={identity}
      pageName={home ? "工作台" : (selected?.name ?? "页面不存在")}
    >
      {home ? (
        <main className="workbench-page">
          <WelcomePanel identity={identity} />
          <PortalKpiGroup type={identity.type} module={module.code} />
          <div className="workbench-bottom-grid">
            <RecentTodos />
            <WorkbenchRecentVisits
              scope={`${identity.id}:${module.code}`}
              paths={(menus.data ?? []).flatMap((group) =>
                group.children.map((menu) => `/m/${module.code}${menu.path}`),
              )}
            />
          </div>
        </main>
      ) : (
        <section className="workbench-unavailable">
          <h1>{selected?.name ?? "页面不存在"}</h1>
          <p>
            {selected
              ? "此功能暂未开放。"
              : "当前身份没有此页面的访问权限，请从侧栏选择可用菜单。"}
          </p>
        </section>
      )}
    </ModuleLayout>
  );
}

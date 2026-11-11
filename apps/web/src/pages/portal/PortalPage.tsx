import "./PortalPage.css";
import type { AvailableApp } from "@smart-sport/contracts";
import { Navigate, useNavigate } from "react-router";
import { PortalLayout } from "../../layouts/portal-layout/PortalLayout";
import { useAvailableApps } from "../../shared/hooks/use-navigation";
import { useSession } from "../../shared/stores/session";
import { ApplicationGrid } from "./components/application-grid/ApplicationGrid";
import { PortalKpiGroup } from "./components/portal-kpi-group/PortalKpiGroup";
import { PortalState } from "./components/portal-state/PortalState";
import { RecentTodos } from "./components/recent-todos/RecentTodos";
import { RecentVisits } from "./components/recent-visits/RecentVisits";
import { WelcomePanel } from "./components/welcome-panel/WelcomePanel";
export function PortalPage() {
  const token = useSession((state) => state.accessToken),
    identity = useSession((state) => state.currentIdentity);
  const apps = useAvailableApps();
  const navigate = useNavigate();
  if (!token) return <Navigate to="/login" replace />;
  if (!identity) return <Navigate to="/select-org" replace />;
  const open = (app: AvailableApp) => navigate(`/app/${app.code}`);
  return (
    <PortalLayout identity={identity}>
      <div className="portal-main">
        <WelcomePanel identity={identity} />
        <PortalKpiGroup type={identity.type} />
        <section aria-labelledby="portal-applications">
          <div className="portal-section-heading">
            <h2 id="portal-applications">我的应用</h2>
            <span>只展示当前身份可用的应用</span>
          </div>
          {apps.isPending ? (
            <PortalState state="loading" />
          ) : apps.isError ? (
            <PortalState state="error" onRetry={() => void apps.refetch()} />
          ) : !apps.data.length ? (
            <PortalState state="empty" />
          ) : (
            <ApplicationGrid apps={apps.data} onOpen={open} />
          )}
        </section>
        <div className="portal-bottom-grid">
          <RecentTodos />
          <RecentVisits identityId={identity.id} apps={apps.data ?? []} />
        </div>
      </div>
    </PortalLayout>
  );
}

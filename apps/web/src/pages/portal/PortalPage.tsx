import { lazy, Suspense } from "react";
import { useNavigate } from "react-router";
import { ApplicationGrid } from "./components/application-grid/ApplicationGrid";
import { PortalKpiGroup } from "./components/portal-kpi-group/PortalKpiGroup";
import { WelcomePanel } from "./components/welcome-panel/WelcomePanel";
import { WorkspacePreviewCard } from "./components/workspace-preview-card/WorkspacePreviewCard";
import { previewApplications, previewMetrics } from "./preview-data";

const BackendHealthStatus = import.meta.env.DEV
  ? lazy(() =>
      import("./components/backend-health-status/BackendHealthStatus").then(
        ({ BackendHealthStatus }) => ({ default: BackendHealthStatus }),
      ),
    )
  : null;

export function PortalPage() {
  const navigate = useNavigate();
  return (
    <div className="workspace space-y-8">
      <WelcomePanel
        status={
          BackendHealthStatus && (
            <Suspense fallback={null}>
              <BackendHealthStatus />
            </Suspense>
          )
        }
      />
      <PortalKpiGroup metrics={previewMetrics} />
      <ApplicationGrid applications={previewApplications} />
      <WorkspacePreviewCard onPreview={() => navigate("/preview/workspace")} />
    </div>
  );
}

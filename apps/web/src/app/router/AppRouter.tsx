import { Navigate, Route, Routes } from "react-router";
import { AdminLayout } from "../../layouts/admin-layout/AdminLayout";
import { NotFoundPage } from "../../pages/not-found/NotFoundPage";
import { PortalPage } from "../../pages/portal/PortalPage";
import { UpgradeBrowserPage } from "../../pages/upgrade-browser/UpgradeBrowserPage";
import { WorkspacePage } from "../../pages/workspace/WorkspacePage";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/upgrade-browser" element={<UpgradeBrowserPage />} />
      <Route element={<AdminLayout />}>
        <Route path="/" element={<Navigate to="/preview/portal" replace />} />
        <Route path="/preview/portal" element={<PortalPage />} />
        <Route path="/preview/workspace" element={<WorkspacePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

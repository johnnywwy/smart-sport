import { Navigate, Route, Routes } from "react-router";
import { AdminLayout } from "../../layouts/admin-layout/AdminLayout";
import { NotFoundPage } from "../../pages/not-found/NotFoundPage";
import { PortalPage } from "../../pages/portal/PortalPage";
import { WorkspacePage } from "../../pages/workspace/WorkspacePage";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route path="/" element={<Navigate to="/preview/portal" replace />} />
        <Route path="/preview/portal" element={<PortalPage />} />
        <Route path="/preview/workspace" element={<WorkspacePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

import { Navigate, Route, Routes } from "react-router";
import { AdminLayout } from "../../layouts/admin-layout/AdminLayout";
import { AppEntryPage } from "../../pages/app-entry/AppEntryPage";
import { ChangePasswordPage } from "../../pages/change-password/ChangePasswordPage";
import { LoginPage } from "../../pages/login/LoginPage";
import { NotFoundPage } from "../../pages/not-found/NotFoundPage";
import { PortalPage } from "../../pages/portal/PortalPage";
import { SelectOrgPage } from "../../pages/select-org/SelectOrgPage";
import { UpgradeBrowserPage } from "../../pages/upgrade-browser/UpgradeBrowserPage";
import { WorkspacePage } from "../../pages/workspace/WorkspacePage";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route path="/select-org" element={<SelectOrgPage />} />
      <Route path="/portal" element={<PortalPage />} />
      <Route path="/app/:appCode/*" element={<AppEntryPage />} />
      <Route path="/upgrade-browser" element={<UpgradeBrowserPage />} />
      <Route element={<AdminLayout />}>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/preview/workspace" element={<WorkspacePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

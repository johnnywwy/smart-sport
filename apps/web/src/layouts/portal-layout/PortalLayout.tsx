import "./PortalLayout.css";
import { AppLayout } from "@heroui-pro/react/app-layout";
import type { IdentitySummary } from "@smart-sport/contracts";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { PortalHeader } from "../../pages/portal/components/portal-header/PortalHeader";
export function PortalLayout({
  identity,
  children,
}: {
  identity: IdentitySummary;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <AppLayout
      className="portal-layout"
      navigate={navigate}
      scrollMode="page"
      navbar={<PortalHeader identity={identity} />}
    >
      {children}
    </AppLayout>
  );
}

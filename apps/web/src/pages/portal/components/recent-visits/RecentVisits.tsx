import { PortalEmptyState } from "../portal-empty-state/PortalEmptyState";
import { PortalPanel } from "../portal-panel/PortalPanel";
import "./RecentVisits.css";
import { Button } from "@heroui/react";
import type { AvailableApp } from "@smart-sport/contracts";
import { useNavigate } from "react-router";
import { useRecentVisits } from "../../../../shared/stores/recent-visits";
export function RecentVisits({
  identityId,
  apps,
}: {
  identityId: string;
  apps: AvailableApp[];
}) {
  const navigate = useNavigate();
  const history = useRecentVisits((state) => state.byIdentity[identityId]);
  const visits = (history ?? []).filter((visit) =>
    apps.some(({ code }) => code === visit.appCode),
  );
  return (
    <PortalPanel title="最近访问" hint="最多 5 个页面">
      {visits.length ? (
        <div className="portal-recent-list">
          {visits.map((visit) => (
            <Button
              className="portal-recent-item"
              key={visit.path}
              variant="tertiary"
              onPress={() => navigate(visit.path)}
            >
              <span>{visit.name}</span>
              <span aria-hidden="true">↗</span>
            </Button>
          ))}
        </div>
      ) : (
        <PortalEmptyState
          symbol="↗"
          title="从应用开始你的工作"
          description="最近访问的页面会显示在这里"
        />
      )}
    </PortalPanel>
  );
}

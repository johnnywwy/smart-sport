import { Button } from "@heroui/react";
import { useNavigate } from "react-router";
import { useWorkspaceTabs } from "../../../../shared/stores/workspace-tabs";
import { PortalEmptyState } from "../../../portal/components/portal-empty-state/PortalEmptyState";
import { PortalPanel } from "../../../portal/components/portal-panel/PortalPanel";
import "./WorkbenchRecentVisits.css";
export function WorkbenchRecentVisits({
  scope,
  paths,
}: {
  scope: string;
  paths: string[];
}) {
  const navigate = useNavigate();
  const tabs = useWorkspaceTabs((state) => state.recent[scope]);
  const visits = (tabs ?? [])
    .filter((tab) => paths.includes(tab.path))
    .slice(0, 5);
  return (
    <PortalPanel title="最近访问" hint="当前模块">
      {visits.length ? (
        <div className="workbench-recent-list">
          {visits.map((visit) => (
            <Button
              key={visit.path}
              variant="tertiary"
              onPress={() => navigate(visit.path)}
            >
              {visit.name}
              <span aria-hidden="true">↗</span>
            </Button>
          ))}
        </div>
      ) : (
        <PortalEmptyState
          symbol="↗"
          title="还没有访问记录"
          description="从左侧选择菜单，访问记录会显示在这里。"
        />
      )}
    </PortalPanel>
  );
}

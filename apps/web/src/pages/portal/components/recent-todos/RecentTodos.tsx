import { PortalEmptyState } from "../portal-empty-state/PortalEmptyState";
import { PortalPanel } from "../portal-panel/PortalPanel";

export function RecentTodos() {
  return (
    <PortalPanel title="待办" hint="最近 5 条">
      <PortalEmptyState
        symbol="✓"
        title="待办暂未开放"
        description="开放后将在这里展示需要你处理的事项"
      />
    </PortalPanel>
  );
}

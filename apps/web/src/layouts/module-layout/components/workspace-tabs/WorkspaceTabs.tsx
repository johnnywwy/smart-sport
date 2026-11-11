import { Button } from "@heroui/react";
import { useNavigate } from "react-router";
import type { WorkspaceTab } from "../../../../shared/stores/workspace-tabs";
import "./WorkspaceTabs.css";
export function WorkspaceTabs({
  home,
  tabs,
  current,
  onClose,
  onCloseOthers,
}: {
  home: string;
  tabs: WorkspaceTab[];
  current: string;
  onClose: (path: string) => void;
  onCloseOthers: () => void;
}) {
  const navigate = useNavigate();
  return (
    <nav className="workspace-tabs" aria-label="已打开的页面">
      <div className="workspace-tabs-list">
        <Button
          variant="ghost"
          className={
            current === home ? "workspace-tab is-active" : "workspace-tab"
          }
          onPress={() => navigate(home)}
        >
          工作台
        </Button>
        {tabs.map((tab) => (
          <div
            key={tab.path}
            className={
              current === tab.path
                ? "workspace-tab-item is-active"
                : "workspace-tab-item"
            }
          >
            <Button variant="ghost" onPress={() => navigate(tab.path)}>
              {tab.name}
            </Button>
            <Button
              variant="ghost"
              isIconOnly
              size="sm"
              aria-label={`关闭${tab.name}`}
              onPress={() => onClose(tab.path)}
            >
              ×
            </Button>
          </div>
        ))}
      </div>
      <Button size="sm" variant="ghost" onPress={onCloseOthers}>
        关闭其他
      </Button>
    </nav>
  );
}

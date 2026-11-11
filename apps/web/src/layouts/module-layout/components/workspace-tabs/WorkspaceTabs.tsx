import { Button } from "@heroui/react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import type { WorkspaceTab } from "../../../../shared/stores/workspace-tabs";
import "./WorkspaceTabs.css";
export function WorkspaceTabs({
  home,
  tabs,
  current,
  onClose,
}: {
  home: string;
  tabs: WorkspaceTab[];
  current: string;
  onClose: (path: string) => void;
}) {
  const navigate = useNavigate();
  const barRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = barRef.current;
    const list = listRef.current;
    if (!bar || !list) return;
    const onWheel = (event: WheelEvent) => {
      if (
        event.ctrlKey ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY) ||
        list.scrollWidth <= list.clientWidth
      )
        return;
      event.preventDefault();
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 36
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? list.clientWidth
            : 1;
      list.scrollLeft += event.deltaY * unit;
    };
    bar.addEventListener("wheel", onWheel, { passive: false });
    return () => bar.removeEventListener("wheel", onWheel);
  }, []);
  return (
    <nav ref={barRef} className="workspace-tabs" aria-label="已打开的页面">
      <div ref={listRef} className="workspace-tabs-list">
        <Button
          variant="ghost"
          className={
            current === home ? "workspace-tab is-active" : "workspace-tab"
          }
          aria-current={current === home ? "page" : false}
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
            <Button
              className="workspace-tab-link"
              variant="ghost"
              aria-current={current === tab.path ? "page" : false}
              onPress={() => navigate(tab.path)}
            >
              {tab.name}
            </Button>
            <Button
              className="workspace-tab-close"
              variant="ghost"
              isIconOnly
              size="sm"
              aria-label={`关闭${tab.name}`}
              onPress={() => onClose(tab.path)}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </Button>
          </div>
        ))}
      </div>
    </nav>
  );
}

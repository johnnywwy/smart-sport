import { Tabs } from "@heroui/react";
import type { ReactNode } from "react";
import "./TableTabs.css";

export function TableTabs({
  enabled,
  deleted,
  onChange,
  children,
}: {
  enabled: boolean;
  deleted: boolean;
  onChange: (deleted: boolean) => void;
  children: ReactNode;
}) {
  if (!enabled) return children;
  return (
    <Tabs
      className="data-table-tabs"
      selectedKey={deleted ? "recycle" : "active"}
      onSelectionChange={(key) => onChange(key === "recycle")}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label="列表与回收站">
          <Tabs.Tab id="active">
            全部
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="recycle">
            回收站
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel
        id={deleted ? "recycle" : "active"}
        className="data-table-tab-panel"
      >
        {deleted && (
          <p className="data-table-recycle-note">
            已删除的记录。可恢复的记录将显示恢复操作。
          </p>
        )}
        {children}
      </Tabs.Panel>
    </Tabs>
  );
}

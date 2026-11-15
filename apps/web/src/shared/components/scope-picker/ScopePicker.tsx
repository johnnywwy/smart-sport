import { Tabs } from "@heroui/react";
import type { ScopeOption } from "@smart-sport/contracts";
import { ScopeRegionTree } from "./components/scope-region-tree/ScopeRegionTree";
import { ScopeSchoolSearch } from "./components/scope-school-search/ScopeSchoolSearch";
import { ScopeSelectionSummary } from "./components/scope-selection-summary/ScopeSelectionSummary";
import { toggleScope } from "./scope-selection";
import type { ScopeCandidates } from "./types";
import "./ScopePicker.css";

export function ScopePicker({
  value,
  onChange,
  candidates,
  disabled = false,
}: {
  value: readonly ScopeOption[];
  onChange: (value: ScopeOption[]) => void;
  candidates: ScopeCandidates;
  disabled?: boolean;
}) {
  const toggle = (item: ScopeOption, checked: boolean) => {
    if (disabled || !candidates.allowedTypes.includes(item.type)) return;
    onChange(toggleScope(value, item, checked));
  };
  const supported = (["region", "school"] as const).filter((type) =>
    candidates.allowedTypes.includes(type),
  );
  return (
    <section className="scope-picker" aria-label="负责范围选择器">
      <div className="scope-picker-layout">
        <div className="scope-picker-candidates">
          {supported.length === 0 ? (
            <p className="scope-picker-hint">当前组织暂未开放范围选择。</p>
          ) : (
            <Tabs
              variant="secondary"
              align="start"
              selectedKey={
                supported.includes(candidates.type)
                  ? candidates.type
                  : (supported[0] ?? "region")
              }
              onSelectionChange={(key) => {
                if (key === "region" || key === "school")
                  candidates.onTypeChange(key);
              }}
              className="scope-picker-tabs"
            >
              <Tabs.ListContainer>
                <Tabs.List aria-label="选择范围单位">
                  {supported.map((type) => (
                    <Tabs.Tab key={type} id={type}>
                      {type === "region" ? "按区域" : "按学校"}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
              {supported.includes("region") && (
                <Tabs.Panel id="region">
                  <ScopeRegionTree
                    data={candidates.regions}
                    value={value}
                    disabled={disabled}
                    onToggle={toggle}
                  />
                </Tabs.Panel>
              )}
              {supported.includes("school") && (
                <Tabs.Panel id="school">
                  <ScopeSchoolSearch
                    data={candidates.schools}
                    regions={candidates.regions.branches.flatMap(
                      (branch) => branch.items,
                    )}
                    value={value}
                    disabled={disabled}
                    onToggle={toggle}
                  />
                </Tabs.Panel>
              )}
            </Tabs>
          )}
        </div>
        <ScopeSelectionSummary
          value={value}
          disabled={disabled}
          onRemove={(item) => {
            if (!disabled) onChange(toggleScope(value, item, false));
          }}
        />
      </div>
    </section>
  );
}

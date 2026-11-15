import { FileTree } from "@heroui-pro/react/file-tree";
import type { ScopeOption } from "@smart-sport/contracts";
import { coveringRegion, scopeKey } from "../../scope-selection";
import type { ScopeCandidates } from "../../types";
import { ScopeLoadState } from "../scope-load-state/ScopeLoadState";
import { ScopeOptionCheck } from "../scope-option-check/ScopeOptionCheck";
import "./ScopeRegionTree.css";

export function ScopeRegionTree({
  data,
  value,
  disabled,
  onToggle,
}: {
  data: ScopeCandidates["regions"];
  value: readonly ScopeOption[];
  disabled: boolean;
  onToggle: (item: ScopeOption, checked: boolean) => void;
}) {
  const root = data.branches.find((branch) => branch.parent === null);
  const options = data.branches.flatMap((branch) => branch.items);
  const renderItem = (item: ScopeOption) => {
    const branch = data.branches.find((entry) => entry.parent === item.value);
    const children = branch?.items ?? [];
    return (
      <FileTree.Item
        key={item.value}
        id={item.value}
        textValue={item.name}
        title={
          <ScopeOptionCheck
            item={item}
            selected={value.some((entry) => scopeKey(entry) === scopeKey(item))}
            coveredBy={coveringRegion(item, value, options)?.name}
            indeterminate={value.some(
              (entry) =>
                entry.available && !!coveringRegion(entry, [item], options),
            )}
            disabled={disabled}
            onChange={(checked) => onToggle(item, checked)}
          />
        }
      >
        {children.map(renderItem)}
        {!branch?.loaded && (
          <FileTree.Item
            id={`${item.value}:pending`}
            title={
              branch?.error ? "加载失败，请重新加载区划" : "正在加载下级地区…"
            }
            isDisabled
          />
        )}
      </FileTree.Item>
    );
  };
  return (
    <div className="scope-region-panel">
      {root && (
        <ScopeLoadState
          state={root}
          empty={root.items.length === 0}
          noun="地区"
        />
      )}
      {!!root?.items.length && (
        <FileTree
          aria-label="负责区域"
          className="scope-region-tree"
          selectionMode="none"
          showGuideLines={false}
          expandedKeys={new Set(data.expanded)}
          onExpandedChange={(keys) =>
            data.onExpandedChange(new Set([...keys].map(String)))
          }
        >
          {root.items.map(renderItem)}
        </FileTree>
      )}
      {data.branches
        .filter((branch) => branch.parent !== null && branch.error)
        .map((branch) => (
          <ScopeLoadState
            key={branch.parent}
            state={branch}
            empty={false}
            noun="区划"
          />
        ))}
      <p className="scope-picker-hint">
        勾选上级区域即包含全部下级；可在“按学校”中单独选择学校。
      </p>
    </div>
  );
}

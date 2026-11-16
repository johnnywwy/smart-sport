import { Button, Chip } from "@heroui/react";
import type { ScopeOption } from "@smart-sport/contracts";
import { scopeKey, selectionCounts } from "../../scope-selection";
import "./ScopeSelectionSummary.css";

export function ScopeSelectionSummary({
  value,
  disabled,
  onRemove,
}: {
  value: readonly ScopeOption[];
  disabled: boolean;
  onRemove: (item: ScopeOption) => void;
}) {
  const counts = selectionCounts(value);
  return (
    <aside className="scope-selection-summary" aria-label="已选负责范围">
      <h3>已选</h3>
      <ul className="scope-selection-items">
        {value.map((item) => (
          <li
            key={scopeKey(item)}
            data-unavailable={!item.available || undefined}
          >
            <Chip color={item.available ? "accent" : "danger"} variant="soft">
              <Chip.Label>
                {item.available ? item.name : "已失效的负责范围"}
              </Chip.Label>
              {!item.available && <small>已失效</small>}
              {!disabled && (
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={`移除${item.available ? item.name : "已失效的负责范围"}`}
                  onPress={() => onRemove(item)}
                >
                  <svg
                    aria-hidden="true"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </Button>
              )}
            </Chip>
          </li>
        ))}
      </ul>
      {value.length === 0 && (
        <p className="scope-picker-hint">暂未选择负责范围</p>
      )}
      <div className="scope-selection-total" role="status" aria-live="polite">
        已选 <strong>{counts.regions}</strong> 个区域、
        <strong>{counts.schools}</strong> 所学校
      </div>
      <p className="scope-picker-hint">
        区域包含下级范围。此处为选择项数量，不等于展开后的学校去重数量。
      </p>
      {counts.unavailable > 0 && (
        <p className="scope-selection-warning">
          有 {counts.unavailable} 项已失效，请移除后再保存。
        </p>
      )}
    </aside>
  );
}

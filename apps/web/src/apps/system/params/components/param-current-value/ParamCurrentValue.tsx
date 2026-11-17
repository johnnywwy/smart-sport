import { Label } from "@heroui/react";
import type { SystemParam } from "@smart-sport/contracts";
import { paramValueLabel } from "../../param-state";
import "./ParamCurrentValue.css";
export function ParamCurrentValue({ row }: { row: SystemParam }) {
  return (
    <div className="param-current-field">
      <Label>现在的值</Label>
      <div className="param-current-value">{paramValueLabel(row)}</div>
    </div>
  );
}

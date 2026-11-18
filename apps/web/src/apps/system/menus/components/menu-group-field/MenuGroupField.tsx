import { Label } from "@heroui/react";
import "./MenuGroupField.css";
export function MenuGroupField({ name }: { name: string }) {
  return (
    <div className="menu-group-field">
      <Label>所属分组</Label>
      <div className="menu-group-value">{name}</div>
    </div>
  );
}

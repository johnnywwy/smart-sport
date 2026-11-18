import { ListBox } from "@heroui/react";
import type { RegionManagementRow } from "@smart-sport/contracts";
import "./ProvinceList.css";
export function ProvinceList({
  items,
  selected,
  onSelect,
}: {
  items: RegionManagementRow[];
  selected: string | undefined;
  onSelect: (row: RegionManagementRow) => void;
}) {
  return (
    <aside className="province-panel" aria-label="省份">
      <h2>省份</h2>
      <ListBox
        className="province-list"
        aria-label="选择省份"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={selected ? [selected] : []}
        onSelectionChange={(keys) => {
          if (keys !== "all") {
            const row = items.find((r) => keys.has(r.code));
            if (row) onSelect(row);
          }
        }}
      >
        {items.map((row) => (
          <ListBox.Item key={row.code} id={row.code} textValue={row.name}>
            {row.name}
          </ListBox.Item>
        ))}
      </ListBox>
    </aside>
  );
}

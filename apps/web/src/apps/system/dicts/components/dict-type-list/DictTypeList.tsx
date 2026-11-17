import { ListBox } from "@heroui/react";
import type { DictTypeCode } from "@smart-sport/contracts";
import { type DictType, orderDictTypes } from "../../dict-state";
import "./DictTypeList.css";
export function DictTypeList({
  types,
  selected,
  onSelect,
}: {
  types: DictType[];
  selected: DictTypeCode | undefined;
  onSelect: (code: DictTypeCode) => void;
}) {
  return (
    <aside className="dict-type-panel" aria-label="字典分类">
      <h2>字典</h2>
      <ListBox
        aria-label="选择字典"
        className="dict-type-list"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={selected ? [selected] : []}
        onSelectionChange={(keys) => {
          if (keys === "all") return;
          const type = types.find((t) => keys.has(t.code));
          if (type) onSelect(type.code);
        }}
      >
        {orderDictTypes(types).map((type) => (
          <ListBox.Item key={type.code} id={type.code} textValue={type.name}>
            {type.name}
          </ListBox.Item>
        ))}
      </ListBox>
    </aside>
  );
}

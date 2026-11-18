import { ListBox } from "@heroui/react";
import { type ModuleCode, moduleDefinitions } from "@smart-sport/contracts";
import "./ModuleList.css";
export function ModuleList({
  selected,
  onSelect,
}: {
  selected: ModuleCode;
  onSelect: (module: ModuleCode) => void;
}) {
  return (
    <aside className="menu-module-panel" aria-label="模块分类">
      <h2>模块</h2>
      <ListBox
        aria-label="选择模块"
        className="menu-module-list"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[selected]}
        onSelectionChange={(keys) => {
          if (keys === "all") return;
          const module = moduleDefinitions.find((module) =>
            keys.has(module.code),
          );
          if (module) onSelect(module.code);
        }}
      >
        {moduleDefinitions.map((module) => (
          <ListBox.Item
            key={module.code}
            id={module.code}
            textValue={module.name}
          >
            {module.name}
          </ListBox.Item>
        ))}
      </ListBox>
    </aside>
  );
}

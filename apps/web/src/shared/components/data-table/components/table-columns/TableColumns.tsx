import { Dropdown } from "@heroui/react";
import type { TableColumn } from "../../types";

export function TableColumns<T>({
  columns,
  selected,
  onChange,
}: {
  columns: readonly TableColumn<T>[];
  selected: ReadonlySet<string>;
  onChange: (keys: Set<string>) => void;
}) {
  return (
    <Dropdown>
      <Dropdown.Trigger className="data-table-button data-table-secondary">
        列设置
      </Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu
          aria-label="显示列"
          selectionMode="multiple"
          selectedKeys={selected}
          disabledKeys={columns
            .filter((column, index) => index === 0 || column.required)
            .map((column) => column.id)}
          onSelectionChange={(keys) =>
            onChange(
              new Set(
                keys === "all"
                  ? columns.map((column) => column.id)
                  : Array.from(keys, String),
              ),
            )
          }
        >
          {columns.map((column) => (
            <Dropdown.Item
              key={column.id}
              id={column.id}
              textValue={column.label}
              shouldCloseOnSelect={false}
            >
              <Dropdown.ItemIndicator />
              {column.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

import { Button, Popover } from "@heroui/react";
import { FileTree } from "@heroui-pro/react/file-tree";
import type { MemberDepartmentOption } from "@smart-sport/contracts";
import { type ReactElement, useState } from "react";
import { memberDepartmentPath } from "../../member-state";
import "./MemberDepartmentPicker.css";
export function MemberDepartmentPicker({
  items,
  value,
  onChange,
  disabled = false,
}: {
  items: readonly MemberDepartmentOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const render = (parentId: string | null): ReactElement[] =>
    items
      .filter((item) => item.parentId === parentId)
      .map((item) => (
        <FileTree.Item
          key={item.id}
          id={item.id}
          title={item.name}
          textValue={item.name}
        >
          {render(item.id)}
        </FileTree.Item>
      ));
  return (
    <Popover isOpen={open && !disabled} onOpenChange={setOpen}>
      <Button
        variant="secondary"
        isDisabled={disabled}
        className="member-department-trigger"
      >
        <span title={memberDepartmentPath(items, value)}>
          {memberDepartmentPath(items, value)}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </Button>
      <Popover.Content className="member-department-popover">
        <Popover.Dialog aria-label="选择成员部门">
          <FileTree
            aria-label="本组织部门"
            selectionMode="single"
            selectionBehavior="replace"
            selectedKeys={[value ?? "unassigned"]}
            defaultExpandedKeys={items.map((i) => i.id)}
            showGuideLines={false}
            onSelectionChange={(keys) => {
              const id = Array.from(keys)[0];
              if (id === "unassigned" || items.some((item) => item.id === id)) {
                onChange(id === "unassigned" ? null : String(id));
                setOpen(false);
              }
            }}
          >
            <FileTree.Item
              id="unassigned"
              title="未分配部门"
              textValue="未分配部门"
            />
            {render(null)}
          </FileTree>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

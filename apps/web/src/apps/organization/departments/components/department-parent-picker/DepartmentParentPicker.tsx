import { Button, Popover } from "@heroui/react";
import { FileTree } from "@heroui-pro/react/file-tree";
import type { DepartmentNode } from "@smart-sport/contracts";
import { useState } from "react";
import {
  departmentPath,
  excludedParents,
  flattenDepartments,
  organizationRoot,
} from "../../department-state";
import "./DepartmentParentPicker.css";

export function DepartmentParentPicker({
  items,
  value,
  orgName,
  exclude,
  disabled,
  invalid,
  errorId,
  onChange,
}: {
  items: DepartmentNode[];
  value: string | null;
  orgName: string;
  exclude?: string | undefined;
  disabled: boolean;
  invalid: boolean;
  errorId: string;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const excluded = excludedParents(items, exclude);
  const render = (row: DepartmentNode) =>
    excluded.has(row.id) ? null : (
      <FileTree.Item key={row.id} id={row.id} title={row.name}>
        {row.children.map(render)}
      </FileTree.Item>
    );
  return (
    <Popover isOpen={open && !disabled} onOpenChange={setOpen}>
      <Button
        variant="secondary"
        className="department-parent-trigger"
        aria-label="上级部门"
        {...(invalid ? { "aria-describedby": errorId } : {})}
        data-invalid={invalid || undefined}
        isDisabled={disabled}
      >
        <span>
          {value
            ? departmentPath(items, value, orgName)
            : `${orgName}（最上层）`}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </Button>
      <Popover.Content
        placement="bottom start"
        className="department-parent-popover"
      >
        <Popover.Dialog aria-label="选择上级部门">
          <FileTree
            aria-label="上级部门树"
            selectionMode="single"
            selectionBehavior="replace"
            showGuideLines={false}
            defaultExpandedKeys={
              new Set([
                organizationRoot,
                ...flattenDepartments(items).map((row) => row.id),
              ])
            }
            selectedKeys={new Set([value ?? organizationRoot])}
            onSelectionChange={(keys) => {
              if (keys === "all") return;
              const id = String([...keys][0] ?? "");
              if (
                id === organizationRoot ||
                (flattenDepartments(items).some((row) => row.id === id) &&
                  !excluded.has(id))
              ) {
                onChange(id === organizationRoot ? null : id);
                setOpen(false);
              }
            }}
          >
            <FileTree.Item id={organizationRoot} title={`${orgName}（最上层）`}>
              {items.map(render)}
            </FileTree.Item>
          </FileTree>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

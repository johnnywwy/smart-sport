import { Button } from "@heroui/react";
import { FileTree } from "@heroui-pro/react/file-tree";
import type {
  Department,
  DepartmentNode,
  PermissionCode,
  DepartmentTree as Tree,
} from "@smart-sport/contracts";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useDragAndDrop } from "react-aria-components";
import { Can } from "../../../../../shared/components/can/Can";
import {
  canMoveDepartment,
  flattenDepartments,
  organizationRoot,
  unassignedDepartment,
} from "../../department-state";
import "./DepartmentTree.css";

export function DepartmentTree({
  data,
  orgName,
  selected,
  busy,
  permissions,
  onSelect,
  onCreate,
  onMove,
}: {
  data: Tree;
  orgName: string;
  selected: string;
  busy: boolean;
  permissions: PermissionCode[];
  onSelect: (id: string) => void;
  onCreate: (parentId: string | null) => void;
  onMove: (row: Department, parentId: string | null) => void;
}) {
  const rows = useMemo(() => flattenDepartments(data.items), [data.items]);
  const source = useRef<string | null>(null);
  const [expanded, setExpanded] = useState(
    () => new Set([organizationRoot, ...rows.map((row) => row.id)]),
  );
  useEffect(() => {
    setExpanded((current) => {
      const next = new Set(current);
      let row = rows.find((row) => row.id === selected);
      while (row?.parentId) {
        next.add(row.parentId);
        row = rows.find((item) => item.id === row?.parentId);
      }
      next.add(organizationRoot);
      return next.size === current.size ? current : next;
    });
  }, [rows, selected]);
  const drag = useDragAndDrop({
    isDisabled:
      busy || !rows.some((row) => row.allowedActions.includes("update")),
    acceptedDragTypes: ["application/x-smart-sport-department"],
    getAllowedDropOperations: () => ["move"],
    getItems: (keys) => {
      const row = rows.find(
        (row) => keys.has(row.id) && row.allowedActions.includes("update"),
      );
      source.current = row?.id ?? null;
      return row
        ? [
            {
              "application/x-smart-sport-department": row.id,
              "text/plain": row.name,
            },
          ]
        : [];
    },
    getDropOperation: (target) => {
      const row = rows.find((item) => item.id === source.current);
      if (!row || target.type !== "item" || target.dropPosition !== "on")
        return "cancel";
      const parentId =
        target.key === organizationRoot ? null : String(target.key);
      return canMoveDepartment(data.items, row, parentId) ? "move" : "cancel";
    },
    onMove: (event) => {
      const row = rows.find((row) => event.keys.has(row.id));
      const parentId =
        event.target.key === organizationRoot ? null : String(event.target.key);
      if (row && canMoveDepartment(data.items, row, parentId))
        onMove(row, parentId);
    },
  });
  const render = (row: DepartmentNode): ReactNode => (
    <FileTree.Item
      key={row.id}
      id={row.id}
      textValue={row.name}
      dragIcon={row.allowedActions.includes("update") ? undefined : false}
      title={
        <span className="department-tree-label">
          <span className="department-tree-name" title={row.name}>
            {row.name}
          </span>
          <span className="department-tree-count">{row.memberCount}</span>
          {row.allowedActions.includes("create") && (
            <Button
              aria-label={`在${row.name}下新建部门`}
              isIconOnly
              size="sm"
              variant="secondary"
              className="department-tree-add"
              isDisabled={busy}
              onPress={() => onCreate(row.id)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </Button>
          )}
        </span>
      }
    >
      {row.children.map(render)}
    </FileTree.Item>
  );
  return (
    <aside className="department-tree-panel" aria-label="组织部门">
      <FileTree
        aria-label="部门树"
        selectionMode="single"
        selectionBehavior="replace"
        showGuideLines={false}
        selectedKeys={
          selected === unassignedDepartment ? new Set() : new Set([selected])
        }
        expandedKeys={expanded}
        onExpandedChange={(keys) => setExpanded(new Set([...keys].map(String)))}
        disabledKeys={
          busy
            ? new Set([organizationRoot, ...rows.map((row) => row.id)])
            : new Set()
        }
        onSelectionChange={(keys) => {
          if (keys !== "all" && keys.size) onSelect(String([...keys][0]));
        }}
        dragAndDropHooks={drag.dragAndDropHooks}
        className="department-tree"
      >
        <FileTree.Item
          id={organizationRoot}
          textValue={orgName}
          dragIcon={false}
          title={
            <span className="department-tree-label">
              <span className="department-tree-name">{orgName}</span>
            </span>
          }
        >
          {data.items.map(render)}
        </FileTree.Item>
      </FileTree>
      <Button
        className="department-unassigned"
        data-selected={selected === unassignedDepartment}
        isDisabled={busy}
        variant="ghost"
        onPress={() => onSelect(unassignedDepartment)}
      >
        <span>未分配部门</span>
        <span>{data.unassignedMemberCount}</span>
      </Button>
      {!data.items.length && (
        <p className="department-tree-empty">暂无部门，可从下方新建。</p>
      )}
      <Can perm="org:department:create" permissions={permissions}>
        <Button
          variant="secondary"
          className="department-create"
          isDisabled={busy}
          onPress={() =>
            onCreate(rows.some((row) => row.id === selected) ? selected : null)
          }
        >
          新建部门
        </Button>
      </Can>
    </aside>
  );
}

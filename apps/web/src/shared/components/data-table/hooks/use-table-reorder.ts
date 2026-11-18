import { useRef } from "react";
import { useDragAndDrop } from "react-aria-components";
import type { TableConfig, TableRecord } from "../types";
import { tableDropDestination } from "./table-reorder-state";
export function useTableReorder<T extends TableRecord>(
  rows: readonly T[],
  config: TableConfig<T>,
  unavailable: boolean,
) {
  const source = useRef<string | null>(null),
    reorder = config.reorder;
  const enabled = Boolean(
    reorder &&
      rows.some((row) => row.allowedActions.includes(reorder.requiredAction)),
  );
  const canDrop = (row: T, target: T) =>
    Boolean(
      reorder &&
        row.id !== target.id &&
        row.allowedActions.includes(reorder.requiredAction) &&
        target.allowedActions.includes(reorder.requiredAction) &&
        reorder.canDrop(row, target),
    );
  const drag = useDragAndDrop({
    isDisabled: !enabled || unavailable || reorder?.disabled === true,
    acceptedDragTypes: ["application/x-smart-sport-table-row"],
    getAllowedDropOperations: () => ["move"],
    getItems: (keys) => {
      const row = rows.find(
        (row) =>
          keys.has(row.id) &&
          reorder &&
          row.allowedActions.includes(reorder.requiredAction),
      );
      source.current = row?.id ?? null;
      return row
        ? [
            {
              "application/x-smart-sport-table-row": row.id,
              "text/plain": config.rowLabel(row),
            },
          ]
        : [];
    },
    getDropOperation: (target) => {
      if (target.type !== "item" || target.dropPosition === "on")
        return "cancel";
      const row = rows.find((row) => row.id === source.current),
        destination = rows.find((row) => row.id === String(target.key));
      return row &&
        destination &&
        tableDropDestination(
          rows,
          row,
          destination,
          target.dropPosition,
          canDrop,
        )
        ? "move"
        : "cancel";
    },
    onReorder: (event) => {
      const row = rows.find((row) => event.keys.has(row.id)),
        target = rows.find((row) => row.id === String(event.target.key));
      if (!row || !target || event.target.dropPosition === "on") return;
      const destination = tableDropDestination(
        rows,
        row,
        target,
        event.target.dropPosition,
        canDrop,
      );
      if (destination)
        reorder?.onReorder(row, destination.item, destination.position);
    },
  });
  return { enabled, dragAndDropHooks: drag.dragAndDropHooks };
}

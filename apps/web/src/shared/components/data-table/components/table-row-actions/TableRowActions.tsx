import { Button } from "@heroui/react";
import type { TableRecord, TableRowAction } from "../../types";
import { TableConfirmAction } from "../table-confirm-action/TableConfirmAction";
import "./TableRowActions.css";

export function TableRowActions<T extends TableRecord>({
  item,
  actions,
  details,
  disabled,
}: {
  item: T;
  actions: readonly TableRowAction<T>[];
  disabled: boolean;
  details?: { label: string; onPress: (item: T) => void } | undefined;
}) {
  return (
    <div className="data-table-row-actions">
      {details && (
        <Button
          variant="ghost"
          size="sm"
          className="data-table-row-action"
          isDisabled={disabled}
          onPress={() => details.onPress(item)}
        >
          {details.label}
        </Button>
      )}
      {actions
        .filter(({ action }) => item.allowedActions.includes(action))
        .map((action) =>
          !action.opensDialog &&
          (action.action === "delete" ||
            action.danger ||
            action.confirmation) ? (
            <TableConfirmAction
              key={action.action}
              label={action.label}
              className="data-table-row-action data-table-danger"
              disabled={disabled}
              description={
                action.confirmation ??
                "删除后，该记录将从当前列表移除。请确认后继续。"
              }
              onConfirm={() => action.onPress(item)}
            />
          ) : (
            <Button
              key={action.action}
              variant="ghost"
              size="sm"
              className={`data-table-row-action${action.danger ? " data-table-danger" : ""}`}
              isDisabled={disabled}
              onPress={() => action.onPress(item)}
            >
              {action.label}
            </Button>
          ),
        )}
    </div>
  );
}

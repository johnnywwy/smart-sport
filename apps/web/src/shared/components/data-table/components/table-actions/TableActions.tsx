import { Button } from "@heroui/react";
import { Can } from "../../../can/Can";
import type { TableConfig, TableRecord } from "../../types";

export function TableActions<T extends TableRecord>({
  config,
}: {
  config: TableConfig<T>;
}) {
  return (
    <div className="data-table-actions">
      {config.actions?.map((action) => (
        <Can
          key={action.id}
          perm={action.permission}
          permissions={config.permissions}
        >
          <Button
            className={`data-table-button ${action.id === "create" ? "data-table-primary" : "data-table-secondary"}`}
            onPress={action.onPress}
          >
            {action.label}
          </Button>
        </Can>
      ))}
    </div>
  );
}

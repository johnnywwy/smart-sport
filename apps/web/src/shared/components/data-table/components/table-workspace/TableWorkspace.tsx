import { Button } from "@heroui/react";
import { useState } from "react";
import { Can } from "../../../can/Can";
import {
  changeTableQuery,
  selectedActionableRows,
  visibleTableColumns,
} from "../../table-state";
import type { DataTableProps, TableQuery, TableRecord } from "../../types";
import { TableActions } from "../table-actions/TableActions";
import { TableColumns } from "../table-columns/TableColumns";
import { TableConfirmAction } from "../table-confirm-action/TableConfirmAction";
import { TableFilters } from "../table-filters/TableFilters";
import { TableGrid } from "../table-grid/TableGrid";
import { TablePagination } from "../table-pagination/TablePagination";
import { TableTabs } from "../table-tabs/TableTabs";

export function TableWorkspace<T extends TableRecord>({
  config,
  data,
  query,
  onQueryChange,
  status,
  sidebar,
}: DataTableProps<T>) {
  const [visible, setVisible] = useState(
    () => new Set(config.columns.map((column) => column.id)),
  );
  const batchActions = (config.batchActions ?? []).filter((action) =>
    config.permissions.includes(action.permission),
  );
  const batch = config.batchDelete;
  const requiredActions = [
    ...batchActions.map((action) => action.requiredAction),
    ...(batch && config.permissions.includes(batch.permission)
      ? ["delete"]
      : []),
  ];
  const selectionScope = JSON.stringify([
    query,
    config.permissions,
    requiredActions,
    config.selectionRevision,
  ]);
  const [selected, setSelected] = useState({
    scope: selectionScope,
    keys: new Set<string>(),
  });
  if (selected.scope !== selectionScope) {
    setSelected({ scope: selectionScope, keys: new Set() });
  }
  const selectedRows = selectedActionableRows(
    data.items,
    selected.scope === selectionScope ? selected.keys : new Set(),
    requiredActions,
  );
  const keys = new Set(selectedRows.map((item) => item.id));
  const disabled = Boolean(status?.loading || status?.error);
  const selectable = !query.deleted && requiredActions.length > 0;
  const change = (patch: Partial<TableQuery>) =>
    onQueryChange(changeTableQuery(query, patch));
  const grid = (
    <TableGrid
      config={config}
      data={data}
      query={query}
      {...(status ? { status } : {})}
      columns={visibleTableColumns(config.columns, visible)}
      selection={{
        enabled: selectable,
        requiredActions,
        keys,
        onChange: (next) => setSelected({ scope: selectionScope, keys: next }),
      }}
      onChange={onQueryChange}
    />
  );
  return (
    <section className="data-table" aria-label={`${config.title}列表`}>
      <header className="data-table-heading">
        <div>
          <h1>{config.title}</h1>
          {config.description && <p>{config.description}</p>}
        </div>
        {!query.deleted && <TableActions config={config} />}
      </header>
      <TableTabs
        enabled={Boolean(config.recycleBin)}
        deleted={query.deleted}
        onChange={(deleted) => change({ deleted })}
      >
        <div className="data-table-query-row">
          <TableFilters
            key={JSON.stringify([query.keyword, query.filters, query.deleted])}
            config={config}
            query={query}
            onChange={change}
            disabled={Boolean(status?.loading)}
          />
          <TableColumns
            columns={config.columns}
            selected={visible}
            onChange={setVisible}
          />
        </div>
        {selectable && batchActions.length > 0 && selectedRows.length > 0 && (
          <div className="data-table-batch">
            <span>已选择 {selectedRows.length} 条</span>
            {batchActions.map((action) => (
              <Button
                key={action.id}
                className="data-table-button data-table-secondary"
                isDisabled={
                  disabled ||
                  selectedRows.some(
                    (row) =>
                      !row.allowedActions.includes(action.requiredAction),
                  )
                }
                onPress={() => action.onPress(selectedRows)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
        {selectable && batch && selectedRows.length > 0 && (
          <Can perm={batch.permission} permissions={config.permissions}>
            <div className="data-table-batch">
              <span>已选择 {selectedRows.length} 条</span>
              <TableConfirmAction
                label="批量删除"
                description={
                  batch.confirmation ??
                  `将删除当前选择的 ${selectedRows.length} 条记录，删除后将从当前列表移除。请确认后继续。`
                }
                disabled={
                  disabled ||
                  selectedRows.length === 0 ||
                  selectedRows.some(
                    (row) => !row.allowedActions.includes("delete"),
                  )
                }
                className="data-table-button data-table-danger"
                onConfirm={() =>
                  batch.onPress(
                    selectedRows.filter((row) =>
                      row.allowedActions.includes("delete"),
                    ),
                  )
                }
              />
            </div>
          </Can>
        )}
        {sidebar ? (
          <div className="data-table-workspace">
            {sidebar}
            {grid}
          </div>
        ) : (
          grid
        )}
        <TablePagination
          query={query}
          total={data.total}
          disabled={disabled}
          onChange={change}
        />
      </TableTabs>
    </section>
  );
}

import { useState } from "react";
import { Can } from "../../../can/Can";
import {
  changeTableQuery,
  selectedDeletableRows,
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
}: DataTableProps<T>) {
  const [visible, setVisible] = useState(
    () => new Set(config.columns.map((column) => column.id)),
  );
  const selectionScope = JSON.stringify([query, config.permissions]);
  const [selected, setSelected] = useState({
    scope: selectionScope,
    keys: new Set<string>(),
  });
  if (selected.scope !== selectionScope) {
    setSelected({ scope: selectionScope, keys: new Set() });
  }
  const selectedRows = selectedDeletableRows(
    data.items,
    selected.scope === selectionScope ? selected.keys : new Set(),
  );
  const keys = new Set(selectedRows.map((item) => item.id));
  const disabled = Boolean(status?.loading || status?.error);
  const batch = config.batchDelete;
  const selectable =
    !query.deleted &&
    Boolean(batch && config.permissions.includes(batch.permission));
  const change = (patch: Partial<TableQuery>) =>
    onQueryChange(changeTableQuery(query, patch));
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
                disabled={disabled || selectedRows.length === 0}
                className="data-table-button data-table-danger"
                onConfirm={() => batch.onPress(selectedRows)}
              />
            </div>
          </Can>
        )}
        <TableGrid
          config={config}
          data={data}
          query={query}
          {...(status ? { status } : {})}
          columns={visibleTableColumns(config.columns, visible)}
          selection={{
            enabled: selectable,
            keys,
            onChange: (next) =>
              setSelected({ scope: selectionScope, keys: next }),
          }}
          onChange={onQueryChange}
        />
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

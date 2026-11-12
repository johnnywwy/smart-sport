import { Checkbox, Table } from "@heroui/react";
import type { DataTableProps, TableColumn, TableRecord } from "../../types";
import { TableListState } from "../table-list-state/TableListState";
import { TableRowActions } from "../table-row-actions/TableRowActions";
import "./TableGrid.css";

export function TableGrid<T extends TableRecord>({
  config,
  data,
  query,
  status,
  columns,
  selection,
  onChange,
}: Pick<DataTableProps<T>, "config" | "data" | "query" | "status"> & {
  columns: readonly TableColumn<T>[];
  selection: {
    enabled: boolean;
    keys: Set<string>;
    onChange: (keys: Set<string>) => void;
  };
  onChange: DataTableProps<T>["onQueryChange"];
}) {
  const unavailable = Boolean(status?.loading || status?.error);
  const rows = unavailable ? [] : data.items;
  const hasActions = Boolean(config.rowActions?.length);
  return (
    <Table className="data-table-grid">
      <Table.ScrollContainer className="data-table-scroll">
        <Table.Content
          aria-label={config.title}
          aria-busy={Boolean(status?.loading)}
          selectionMode={selection.enabled ? "multiple" : "none"}
          selectionBehavior="toggle"
          selectedKeys={selection.keys}
          disabledKeys={rows
            .filter((item) => !item.allowedActions.includes("delete"))
            .map((item) => item.id)}
          disabledBehavior="selection"
          onSelectionChange={(keys) =>
            selection.onChange(
              new Set(
                keys === "all"
                  ? rows
                      .filter((row) => row.allowedActions.includes("delete"))
                      .map((row) => row.id)
                  : Array.from(keys, String),
              ),
            )
          }
          {...(query.sort ? { sortDescriptor: query.sort } : {})}
          onSortChange={(sort) =>
            onChange({
              ...query,
              page: 1,
              sort: {
                column: String(sort.column),
                direction: sort.direction,
              },
            })
          }
        >
          <Table.Header>
            {selection.enabled && (
              <Table.Column id="$selection" textValue="选择">
                <Checkbox slot="selection" aria-label="选择本页可删除记录">
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox.Content>
                </Checkbox>
              </Table.Column>
            )}
            {columns.map((column, index) => (
              <Table.Column
                key={column.id}
                id={column.id}
                isRowHeader={index === 0}
                allowsSorting={Boolean(column.sortable) && !unavailable}
              >
                {({ sortDirection }) =>
                  column.sortable ? (
                    <Table.SortableColumnHeader
                      {...(sortDirection ? { sortDirection } : {})}
                    >
                      {column.label}
                    </Table.SortableColumnHeader>
                  ) : (
                    column.label
                  )
                }
              </Table.Column>
            ))}
            {hasActions && <Table.Column id="$actions">操作</Table.Column>}
          </Table.Header>
          <Table.Body
            items={rows}
            dependencies={[columns, config.rowActions, selection.enabled]}
            renderEmptyState={() => <TableListState {...status} />}
          >
            {(item) => (
              <Table.Row id={item.id} textValue={config.rowLabel(item)}>
                {selection.enabled && (
                  <Table.Cell>
                    <Checkbox
                      slot="selection"
                      aria-label={`选择${config.rowLabel(item)}`}
                    >
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox.Content>
                    </Checkbox>
                  </Table.Cell>
                )}
                {columns.map((column) => (
                  <Table.Cell key={column.id}>{column.render(item)}</Table.Cell>
                ))}
                {hasActions && (
                  <Table.Cell>
                    <TableRowActions
                      item={item}
                      actions={config.rowActions ?? []}
                      disabled={unavailable}
                    />
                  </Table.Cell>
                )}
              </Table.Row>
            )}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

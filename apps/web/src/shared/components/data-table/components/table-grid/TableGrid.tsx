import { Button, Checkbox, Table } from "@heroui/react";
import { useTableReorder } from "../../hooks/use-table-reorder";
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
    requiredActions: readonly string[];
    keys: Set<string>;
    onChange: (keys: Set<string>) => void;
  };
  onChange: DataTableProps<T>["onQueryChange"];
}) {
  const unavailable = Boolean(status?.loading || status?.error);
  const rows = unavailable ? [] : data.items;
  const reorder = useTableReorder(rows, config, unavailable);
  const hasActions = Boolean(config.rowDetails || config.rowActions?.length);
  return (
    <Table className="data-table-grid">
      <Table.ScrollContainer className="data-table-scroll">
        <Table.Content
          dragAndDropHooks={reorder.dragAndDropHooks}
          aria-label={config.title}
          aria-busy={Boolean(status?.loading)}
          selectionMode={selection.enabled ? "multiple" : "none"}
          selectionBehavior="toggle"
          selectedKeys={selection.keys}
          disabledKeys={(selection.enabled ? rows : [])
            .filter(
              (item) =>
                !selection.requiredActions.some((action) =>
                  item.allowedActions.includes(action),
                ),
            )
            .map((item) => item.id)}
          disabledBehavior="selection"
          onSelectionChange={(keys) =>
            selection.onChange(
              new Set(
                keys === "all"
                  ? rows
                      .filter((row) =>
                        selection.requiredActions.some((action) =>
                          row.allowedActions.includes(action),
                        ),
                      )
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
            {reorder.enabled && (
              <Table.Column id="$drag" textValue="拖动排序">
                <span className="data-table-drag-heading">排序</span>
              </Table.Column>
            )}
            {selection.enabled && (
              <Table.Column id="$selection" textValue="选择">
                <Checkbox
                  slot="selection"
                  aria-label={
                    selection.requiredActions.every(
                      (action) => action === "delete",
                    )
                      ? "选择本页可删除记录"
                      : "选择本页可操作记录"
                  }
                >
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
            dependencies={[
              columns,
              config.rowActions,
              config.rowDetails,
              selection.enabled,
              reorder.enabled,
              config.reorder,
            ]}
            renderEmptyState={() => <TableListState {...status} />}
          >
            {(item) => (
              <Table.Row
                id={item.id}
                textValue={config.rowLabel(item)}
                data-active={config.activeRowId === item.id || undefined}
              >
                {reorder.enabled && (
                  <Table.Cell>
                    <Button
                      slot="drag"
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      className="data-table-drag-handle"
                      aria-label={`拖动排序${config.rowLabel(item)}`}
                      isDisabled={
                        unavailable ||
                        config.reorder?.disabled === true ||
                        !item.allowedActions.includes(
                          config.reorder?.requiredAction ?? "",
                        )
                      }
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <circle cx="8" cy="5" r="1.5" />
                        <circle cx="16" cy="5" r="1.5" />
                        <circle cx="8" cy="12" r="1.5" />
                        <circle cx="16" cy="12" r="1.5" />
                        <circle cx="8" cy="19" r="1.5" />
                        <circle cx="16" cy="19" r="1.5" />
                      </svg>
                    </Button>
                  </Table.Cell>
                )}
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
                      details={config.rowDetails}
                      disabled={
                        unavailable || config.reorder?.disabled === true
                      }
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

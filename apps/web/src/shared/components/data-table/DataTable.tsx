import { TableWorkspace } from "./components/table-workspace/TableWorkspace";
import type { DataTableProps, TableRecord } from "./types";
import "./DataTable.css";

export function DataTable<T extends TableRecord>(props: DataTableProps<T>) {
  return <TableWorkspace key={props.scopeKey} {...props} />;
}

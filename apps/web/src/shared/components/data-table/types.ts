import type {
  PermissionCode,
  paginatedSchema,
  paginationQuerySchema,
} from "@smart-sport/contracts";
import type { ReactNode } from "react";

export type TableRecord = { id: string; allowedActions: readonly string[] };
export type TablePage<T> = Omit<
  ReturnType<ReturnType<typeof paginatedSchema>["parse"]>,
  "items"
> & { items: T[] };
export type TableQuery = ReturnType<typeof paginationQuerySchema.parse> & {
  keyword: string;
  filters: Record<string, string>;
  sort?: { column: string; direction: "ascending" | "descending" };
  deleted: boolean;
};
export type TableColumn<T> = {
  id: string;
  label: string;
  render: (item: T) => ReactNode;
  sortable?: boolean;
  required?: boolean;
};
export type TableFilter = {
  id: string;
  label: string;
  options: readonly { id: string; label: string }[];
};
export type TableAction = {
  id: "create" | "import" | "export";
  label: string;
  permission: PermissionCode;
  onPress: () => void;
};
export type TableRowAction<T> = {
  action: string;
  label: string;
  danger?: boolean;
  confirmation?: string;
  onPress: (item: T) => void;
};
export type TableConfig<T> = {
  title: string;
  description?: string;
  searchPlaceholder?: string;
  columns: readonly TableColumn<T>[];
  filters?: readonly TableFilter[];
  permissions: readonly PermissionCode[];
  actions?: readonly TableAction[];
  rowActions?: readonly TableRowAction<T>[];
  batchActions?: readonly {
    id: string;
    label: string;
    permission: PermissionCode;
    requiredAction: string;
    onPress: (items: readonly T[]) => void;
  }[];
  /** 写入后递增，清除旧版本的选择。 */
  selectionRevision?: number;
  activeRowId?: string | undefined;
  batchDelete?: {
    permission: PermissionCode;
    onPress: (items: readonly T[]) => void;
    confirmation?: string;
  };
  recycleBin?: boolean;
  rowLabel: (item: T) => string;
};
export type DataTableProps<T extends TableRecord> = {
  /** 身份 id；学校数据还需包含学校 id。改变后重置勾选与列设置。 */
  scopeKey: string;
  config: TableConfig<T>;
  data: TablePage<T>;
  query: TableQuery;
  onQueryChange: (query: TableQuery) => void;
  status?: {
    loading?: boolean;
    error?: boolean;
    onRetry?: () => void;
  };
};

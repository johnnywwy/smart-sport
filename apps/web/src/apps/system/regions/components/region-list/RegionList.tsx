import { Button } from "@heroui/react";
import type {
  PermissionCode,
  RegionManagementRow,
} from "@smart-sport/contracts";
import type { ReactNode } from "react";
import { DataTable } from "../../../../../shared/components/data-table/DataTable";
import type {
  DataTableProps,
  TablePage,
  TableQuery,
} from "../../../../../shared/components/data-table/types";
import { bureauLabel, regionLevelName } from "../../region-state";
import "./RegionList.css";
export function RegionList({
  identityId,
  permissions,
  data,
  query,
  onQueryChange,
  sidebar,
  status,
  trail,
  onNavigate,
  onView,
  onSync,
}: {
  identityId: string;
  permissions: PermissionCode[];
  data: TablePage<RegionManagementRow>;
  query: TableQuery;
  onQueryChange: (q: TableQuery) => void;
  sidebar: ReactNode;
  status: DataTableProps<RegionManagementRow & { id: string }>["status"];
  trail: RegionManagementRow[];
  onNavigate: (index: number) => void;
  onView: (row: RegionManagementRow) => void;
  onSync: () => void;
}) {
  return (
    <div className="region-list">
      <nav className="region-trail" aria-label="当前区划层级">
        {trail.map((r, i) => (
          <span key={r.code}>
            {i > 0 && <span aria-hidden="true">/</span>}
            <Button
              variant="tertiary"
              onPress={() => onNavigate(i)}
              aria-current={i === trail.length - 1 ? "location" : false}
            >
              {r.name}
            </Button>
          </span>
        ))}
      </nav>
      <DataTable
        scopeKey={identityId}
        sidebar={sidebar}
        config={{
          title: "行政区划",
          description: "省、市、区三级，用来划定教育局的辖区和学校的所在地。",
          searchPlaceholder: "名称",
          permissions,
          actions: [
            {
              id: "import",
              label: "同步最新区划",
              permission: "system:region:import",
              onPress: onSync,
            },
          ],
          rowLabel: (r) => r.name,
          rowActions: [{ action: "view", label: "查看", onPress: onView }],
          columns: [
            {
              id: "name",
              label: "名称",
              required: true,
              sortable: true,
              render: (r) => <strong>{r.name}</strong>,
            },
            {
              id: "level",
              label: "级别",
              render: (r) => regionLevelName(r.level),
            },
            {
              id: "parent",
              label: "上级",
              render: (r) => r.parentName ?? "无",
            },
            { id: "schools", label: "学校数", render: (r) => r.schoolCount },
            {
              id: "bureaus",
              label: "对应教育局",
              render: (r) => (
                <span className={r.bureaus.length ? "" : "region-unlinked"}>
                  {bureauLabel(r)}
                </span>
              ),
            },
          ],
        }}
        data={{ ...data, items: data.items.map((r) => ({ ...r, id: r.code })) }}
        query={query}
        onQueryChange={onQueryChange}
        {...(status ? { status } : {})}
      />
    </div>
  );
}

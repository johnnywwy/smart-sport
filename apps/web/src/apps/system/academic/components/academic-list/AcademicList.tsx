import { Chip } from "@heroui/react";
import type {
  AcademicYear,
  PermissionCode,
  Semester,
} from "@smart-sport/contracts";
import { DataTable } from "../../../../../shared/components/data-table/DataTable";
import type { TableQuery } from "../../../../../shared/components/data-table/types";
import { academicStatus, academicTablePage } from "../../academic-state";
import { AcademicRowActions } from "../academic-row-actions/AcademicRowActions";
import "./AcademicList.css";

export function AcademicList({
  identityId,
  years,
  permissions,
  query,
  onQueryChange,
  status,
  onCreate,
  onSelect,
}: {
  identityId: string;
  years: AcademicYear[];
  permissions: PermissionCode[];
  query: TableQuery;
  onQueryChange: (query: TableQuery) => void;
  status: { loading: boolean; error: boolean; onRetry: () => void };
  onCreate: () => void;
  onSelect: (
    year: AcademicYear,
    kind: "view" | "edit" | "current",
    semester?: Semester,
  ) => void;
}) {
  const page = academicTablePage(years, query);
  return (
    <DataTable
      scopeKey={identityId}
      config={{
        title: "学年学期",
        description: "全平台统一的学年和学期日期。",
        searchPlaceholder: "搜索学年",
        filters: [
          {
            id: "year",
            label: "学年",
            options: [...years]
              .sort((a, b) => b.startDate.localeCompare(a.startDate))
              .map((y) => ({ id: y.id, label: y.name })),
          },
        ],
        permissions,
        actions: [
          {
            id: "create",
            label: "新建学年",
            permission: "system:academic:create",
            onPress: onCreate,
          },
        ],
        rowLabel: (year) => year.name,
        columns: [
          {
            id: "name",
            label: "学年",
            sortable: true,
            required: true,
            render: (year) => (
              <strong className="academic-year-name">{year.name}</strong>
            ),
          },
          {
            id: "first",
            label: "第一学期",
            render: (year) => (
              <span className="academic-date-range">
                {year.semesters[0].startDate} 至 {year.semesters[0].endDate}
              </span>
            ),
          },
          {
            id: "second",
            label: "第二学期",
            render: (year) => (
              <span className="academic-date-range">
                {year.semesters[1].startDate} 至 {year.semesters[1].endDate}
              </span>
            ),
          },
          {
            id: "status",
            label: "状态",
            render: (year) => (
              <Chip
                size="sm"
                variant="soft"
                className={`academic-status academic-status-${year.status}`}
              >
                {academicStatus[year.status]}
              </Chip>
            ),
          },
          {
            id: "actions",
            label: "操作",
            render: (year) => (
              <AcademicRowActions
                year={year}
                onEdit={(s) => onSelect(year, "edit", s)}
                onCurrent={(s) => onSelect(year, "current", s)}
                onView={() => onSelect(year, "view")}
              />
            ),
          },
        ],
      }}
      data={page}
      query={{ ...query, page: page.page }}
      onQueryChange={onQueryChange}
      status={status}
    />
  );
}

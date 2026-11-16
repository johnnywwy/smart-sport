import { Button } from "@heroui/react";
import type { scopeSchoolsSchema } from "@smart-sport/contracts";
import { DataTable } from "../../../../../shared/components/data-table/DataTable";
import type { TableQuery } from "../../../../../shared/components/data-table/types";
import type { SchoolChoice } from "../../../../../shared/types/school";
import "./SchoolList.css";

export function SchoolList({
  identityId,
  data,
  query,
  onQueryChange,
  status,
  enter,
}: {
  identityId: string;
  data: ReturnType<typeof scopeSchoolsSchema.parse> | undefined;
  query: TableQuery;
  onQueryChange: (query: TableQuery) => void;
  status: { loading: boolean; error: boolean; onRetry: () => void };
  enter: {
    enabled: boolean;
    busy: boolean;
    onSelect: (school: SchoolChoice) => void;
  };
}) {
  return (
    <DataTable
      scopeKey={identityId}
      config={{
        title: "学校管理",
        description: enter.enabled
          ? "查看负责范围内的学校，进入学校后管理班级、学生和教师。"
          : "查看负责范围内的学校。",
        searchPlaceholder: "搜索学校名称",
        permissions: [],
        rowLabel: (row) => row.name,
        columns: [
          { id: "name", label: "学校名称", render: (row) => row.name },
          { id: "region", label: "所在地区", render: (row) => row.regionName },
          ...(enter.enabled
            ? [
                {
                  id: "enter",
                  label: "操作",
                  render: (row: NonNullable<typeof data>["items"][number]) =>
                    row.allowedActions.includes("view") ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="school-list-enter"
                        isDisabled={enter.busy}
                        onPress={() => enter.onSelect(row)}
                      >
                        进入
                      </Button>
                    ) : null,
                },
              ]
            : []),
        ],
      }}
      data={
        data ?? {
          items: [],
          total: 0,
          page: query.page,
          pageSize: query.pageSize,
        }
      }
      query={query}
      onQueryChange={onQueryChange}
      status={status}
    />
  );
}

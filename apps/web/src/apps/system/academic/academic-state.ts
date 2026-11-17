import {
  type AcademicYear,
  createAcademicYearSchema,
  type PermissionCode,
  type Semester,
} from "@smart-sport/contracts";
import type { TableQuery } from "../../../shared/components/data-table/types";

export const initialAcademicQuery: TableQuery = {
  page: 1,
  pageSize: 20,
  keyword: "",
  filters: {},
  deleted: false,
};
export const academicStatus = {
  draft: "未开始",
  current: "当前学年",
  closed: "已结束",
} as const;
export function academicPermissions(
  allowed: readonly string[],
): PermissionCode[] {
  return allowed.includes("create") ? ["system:academic:create"] : [];
}
export function academicTablePage(years: AcademicYear[], query: TableQuery) {
  const keyword = query.keyword.trim().toLowerCase();
  const rows = years
    .filter(
      (year) =>
        (!query.filters.year || year.id === query.filters.year) &&
        (!keyword || year.name.toLowerCase().includes(keyword)),
    )
    .map((year) => ({
      ...year,
      allowedActions: [
        ...new Set(year.semesters.flatMap((s) => s.allowedActions)),
      ],
    }));
  rows.sort((a, b) =>
    query.sort?.direction === "ascending"
      ? a.startDate.localeCompare(b.startDate)
      : b.startDate.localeCompare(a.startDate),
  );
  const page = Math.min(
    query.page,
    Math.max(1, Math.ceil(rows.length / query.pageSize)),
  );
  return {
    items: rows.slice((page - 1) * query.pageSize, page * query.pageSize),
    total: rows.length,
    page,
    pageSize: query.pageSize,
  };
}
export function semesterValues(semester: Semester) {
  return { startDate: semester.startDate, endDate: semester.endDate };
}
export function academicPlan(input: unknown) {
  const parsed = createAcademicYearSchema.safeParse({ startYear: input });
  if (!parsed.success) return null;
  const start = String(parsed.data.startYear).padStart(4, "0");
  const end = String(parsed.data.startYear + 1).padStart(4, "0");
  return {
    name: `${start}-${end}学年`,
    semesters: [
      {
        name: "第一学期",
        startDate: `${start}-09-01`,
        endDate: `${end}-01-31`,
      },
      { name: "第二学期", startDate: `${end}-02-01`, endDate: `${end}-07-31` },
    ],
  };
}
export function suggestedAcademicYear(years: AcademicYear[], now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  let value = year - (month < 9 ? 1 : 0);
  const used = new Set(years.map((row) => Number(row.startDate.slice(0, 4))));
  while (used.has(value) && value < 9998) value++;
  return value;
}

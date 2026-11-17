import { type AcademicYear, academicYearSchema } from "@smart-sport/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { academicYearExample } from "../../../shared/testing/academic-fixtures";
import {
  academicPermissions,
  academicPlan,
  academicTablePage,
  initialAcademicQuery,
  suggestedAcademicYear,
} from "./academic-state";
import { AcademicList } from "./components/academic-list/AcademicList";
import { AcademicRowActions } from "./components/academic-row-actions/AcademicRowActions";

function year(startYear: number, status: AcademicYear["status"] = "draft") {
  const source = structuredClone(academicYearExample);
  return academicYearSchema.parse({
    ...source,
    id: source.id.slice(0, -4) + startYear,
    name: `${startYear}-${startYear + 1}学年`,
    startDate: `${startYear}-09-01`,
    status,
    isCurrent: status === "current",
    semesters: source.semesters.map((s) => ({
      ...s,
      allowedActions: status === "closed" ? [] : s.allowedActions,
    })),
  });
}
it("学年筛选、搜索、排序与翻页一起生效，越界页回到有效页", () => {
  const years = [year(2025, "closed"), year(2027), year(2026, "current")];
  const result = academicTablePage(years, {
    ...initialAcademicQuery,
    page: 2,
    pageSize: 2,
  });
  expect(result.total).toBe(3);
  expect(result.items[0]?.name).toBe("2025-2026学年");
  expect(result.items[0]?.allowedActions).toEqual([]);
  const filtered = academicTablePage(years, {
    ...initialAcademicQuery,
    page: 99,
    keyword: " 2026-2027 ",
    filters: { year: years[2]?.id ?? "" },
  });
  expect(filtered.page).toBe(1);
  expect(filtered.items.map((y) => y.name)).toEqual(["2026-2027学年"]);
  expect(
    academicTablePage(years, {
      ...initialAcademicQuery,
      sort: { column: "name", direction: "ascending" },
    }).items[0]?.name,
  ).toBe("2025-2026学年");
});
it("新建预览只接受契约允许的整数年份，推荐按上海九月学年边界并跳过已有年", () => {
  expect(academicPlan("2026")).toBeNull();
  expect(academicPlan(0)).toBeNull();
  expect(academicPlan(9999)).toBeNull();
  expect(academicPlan(2026)?.semesters).toEqual([
    { name: "第一学期", startDate: "2026-09-01", endDate: "2027-01-31" },
    { name: "第二学期", startDate: "2027-02-01", endDate: "2027-07-31" },
  ]);
  expect(suggestedAcademicYear([], new Date("2026-08-31T15:59:59Z"))).toBe(
    2025,
  );
  expect(suggestedAcademicYear([], new Date("2026-08-31T16:00:00Z"))).toBe(
    2026,
  );
  expect(
    suggestedAcademicYear([year(2026), year(2027)], new Date("2026-11-17")),
  ).toBe(2028);
});
it("空学年列表仅依据服务端新建能力显示入口，不依赖已有行或角色名称", () => {
  const markup = (allowed: string[]) =>
    renderToStaticMarkup(
      <AcademicList
        identityId="actor"
        years={[]}
        permissions={academicPermissions(allowed)}
        query={initialAcademicQuery}
        onQueryChange={() => {}}
        status={{ loading: false, error: false, onRetry: () => {} }}
        onCreate={() => {}}
        onSelect={() => {}}
      />,
    );
  expect(markup([])).not.toContain("新建学年");
  expect(markup(["update"])).not.toContain("新建学年");
  expect(markup(["create"])).toContain("新建学年");
  expect(markup(["create"])).toContain("共 0 条");
});
it("只读和已关闭的学年只有查看入口，当前学期不能重复设为当前", () => {
  const markup = (row: AcademicYear) =>
    renderToStaticMarkup(
      <AcademicRowActions
        year={row}
        onEdit={() => {}}
        onCurrent={() => {}}
        onView={() => {}}
      />,
    );
  const closed = markup(year(2025, "closed"));
  expect(closed).toContain("查看");
  expect(closed).not.toContain("编辑日期");
  expect(closed).not.toContain("设为当前");
  const readonly = structuredClone(academicYearExample);
  for (const semester of readonly.semesters) semester.allowedActions = [];
  expect(markup(readonly)).not.toContain("编辑日期");
  expect(markup(academicYearExample)).toContain("编辑日期");
  expect(markup(academicYearExample)).toContain("设为当前");
});

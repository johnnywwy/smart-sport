import { type AcademicYear, academicYearSchema } from "@smart-sport/contracts";
import { expect, it } from "vitest";
import { academicYearExample } from "../testing/academic-fixtures";
import {
  academicQueryPeriod,
  resolveAcademicPeriod,
} from "./academic-selection";

function otherYear(id: string, status: AcademicYear["status"]) {
  return academicYearSchema.parse({
    ...academicYearExample,
    id,
    status,
    isCurrent: status === "current",
    semesters: academicYearExample.semesters.map((s) => ({
      ...s,
      id: id.slice(0, -1) + (s.term + 1),
      academicYearId: id,
      isCurrent: status === "current" && s.term === 2,
    })),
  });
}
it("空库及未设置当前的日历不猜测第一个学期，仍允许手选待用学期", () => {
  expect(resolveAcademicPeriod([], null).selection).toBeNull();
  const draft = otherYear("019a87ce-8000-7000-8000-000000000001", "draft");
  expect(resolveAcademicPeriod([draft], null).selection).toBeNull();
  const result = resolveAcademicPeriod([draft], {
    academicYearId: draft.id,
    semesterId: draft.semesters[1].id,
  });
  expect(result.selection?.semester.term).toBe(2);
  expect(result.current).toBeNull();
});
it("默认使用实际当前标记，手选历史学期产生成对查询参数", () => {
  const closed = otherYear("019a87ce-8000-7000-8000-000000000001", "closed");
  const years = [closed, academicYearExample];
  expect(resolveAcademicPeriod(years, null).selection?.semester.id).toBe(
    academicYearExample.semesters[0].id,
  );
  const choice = {
    academicYearId: closed.id,
    semesterId: closed.semesters[1].id,
  };
  const result = resolveAcademicPeriod(years, choice);
  expect(result.invalidChoice).toBe(false);
  expect(academicQueryPeriod(result.selection)).toEqual(choice);
  expect(academicQueryPeriod(null)).toBeNull();
  expect(years[1]?.isCurrent).toBe(true);
  expect(closed.isCurrent).toBe(false);
});
it("学期不存在或学年不匹配时回到真实当前，不将两个学年的id拼在一起", () => {
  const draft = otherYear("019a87ce-8000-7000-8000-000000000001", "draft");
  const result = resolveAcademicPeriod([draft, academicYearExample], {
    academicYearId: draft.id,
    semesterId: academicYearExample.semesters[0].id,
  });
  expect(result.invalidChoice).toBe(true);
  expect(result.selection?.academicYear.id).toBe(academicYearExample.id);
  expect(
    resolveAcademicPeriod([], {
      academicYearId: draft.id,
      semesterId: draft.semesters[0].id,
    }),
  ).toMatchObject({ selection: null, invalidChoice: true });
});
it("平台切换当前后默认跟随新标记，已手选的历史学期保持不变", () => {
  const old = structuredClone(academicYearExample);
  old.isCurrent = false;
  old.status = "closed";
  for (const s of old.semesters) s.isCurrent = false;
  const next = otherYear("019a87ce-8000-7000-8000-000000000001", "current");
  const years = [next, old];
  expect(resolveAcademicPeriod(years, null).selection?.semester.id).toBe(
    next.semesters[1].id,
  );
  expect(
    resolveAcademicPeriod(years, {
      academicYearId: old.id,
      semesterId: old.semesters[0].id,
    }).selection?.semester.id,
  ).toBe(old.semesters[0].id);
});

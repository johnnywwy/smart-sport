import type { AcademicYear } from "@smart-sport/contracts";
import type { AcademicPeriod, SelectedAcademicPeriod } from "../types/academic";

/** 默认跟随服务器当前标记，不能按今天日期或第一条记录猜测。 */
export function resolveAcademicPeriod(
  years: readonly AcademicYear[],
  choice: AcademicPeriod | null,
) {
  const currentYear = years.find((year) => year.isCurrent);
  const currentSemester = currentYear?.semesters.find(
    (semester) => semester.isCurrent,
  );
  const current: SelectedAcademicPeriod | null =
    currentYear && currentSemester
      ? { academicYear: currentYear, semester: currentSemester }
      : null;
  const year = years.find((year) => year.id === choice?.academicYearId);
  const semester = year?.semesters.find((s) => s.id === choice?.semesterId);
  return {
    current,
    selection: year && semester ? { academicYear: year, semester } : current,
    invalidChoice: choice !== null && (!year || !semester),
  };
}

export function academicQueryPeriod(selection: SelectedAcademicPeriod | null) {
  return selection
    ? {
        academicYearId: selection.academicYear.id,
        semesterId: selection.semester.id,
      }
    : null;
}

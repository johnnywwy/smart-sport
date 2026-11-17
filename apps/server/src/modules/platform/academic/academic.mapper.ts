import { academicYearListSchema, type Semester } from "@smart-sport/contracts";
import type { AcademicYearRow, SemesterRow } from "./academic.repository.js";
import { academicDate } from "./academic-calendar.js";

export function academicYearsResponse(
  rows: { year: AcademicYearRow; semester: SemesterRow | null }[],
  editable: boolean,
) {
  const groups = new Map<
    string,
    { year: AcademicYearRow; semesters: Semester[] }
  >();
  for (const { year, semester } of rows) {
    let result = groups.get(year.id);
    if (!result) {
      result = { year, semesters: [] };
      groups.set(year.id, result);
    }
    if (semester)
      result.semesters.push({
        id: semester.id,
        academicYearId: semester.academicYearId,
        term: semester.term as Semester["term"],
        name: semester.name,
        startDate: academicDate(semester.startDate),
        endDate: academicDate(semester.endDate),
        isCurrent: semester.isCurrent,
        version: semester.version,
        allowedActions:
          editable && year.status !== "closed"
            ? semester.isCurrent
              ? ["update"]
              : ["update", "set-current"]
            : [],
      });
  }
  return academicYearListSchema.parse(
    [...groups.values()].map(({ year, semesters }) => ({
      id: year.id,
      name: year.name,
      startDate: academicDate(year.startDate),
      endDate: academicDate(year.endDate),
      status: year.status,
      isCurrent: year.isCurrent,
      version: year.version,
      semesters,
    })),
  );
}

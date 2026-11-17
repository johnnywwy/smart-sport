import type { AcademicYear, Semester } from "@smart-sport/contracts";

export type AcademicPeriod = {
  academicYearId: AcademicYear["id"];
  semesterId: Semester["id"];
};
export type SelectedAcademicPeriod = {
  academicYear: AcademicYear;
  semester: Semester;
};

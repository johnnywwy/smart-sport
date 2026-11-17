import { academicYearSchema, currentAcademicSchema } from "./academic.js";

const yearId = "019a87ce-7000-7000-8000-000000000001";
export const academicYearExample = academicYearSchema.parse({
  id: yearId,
  name: "2026-2027学年",
  startDate: "2026-09-01",
  endDate: "2027-08-31",
  status: "current",
  isCurrent: true,
  version: 1,
  semesters: [
    {
      id: "019a87ce-7000-7000-8000-000000000002",
      academicYearId: yearId,
      term: 1,
      name: "第一学期",
      startDate: "2026-09-01",
      endDate: "2027-01-31",
      isCurrent: true,
      version: 1,
      allowedActions: ["update"],
    },
    {
      id: "019a87ce-7000-7000-8000-000000000003",
      academicYearId: yearId,
      term: 2,
      name: "第二学期",
      startDate: "2027-02-01",
      endDate: "2027-07-31",
      isCurrent: false,
      version: 0,
      allowedActions: ["update", "set-current"],
    },
  ],
});
export const currentAcademicExample = currentAcademicSchema.parse({
  academicYear: academicYearExample,
  semester: academicYearExample.semesters[0],
});

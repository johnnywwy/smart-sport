import {
  academicYearSchema,
  currentAcademicSchema,
} from "@smart-sport/contracts";

const yearId = "019a87ce-7000-7000-8000-000000000001";
export const academicYearExample = academicYearSchema.parse({
  id: yearId,
  name: "2026-2027学年",
  startDate: "2026-09-01",
  endDate: "2027-08-31",
  status: "current",
  isCurrent: true,
  version: 1,
  semesters: [1, 2].map((term) => ({
    id: `019a87ce-7000-7000-8000-00000000000${term + 1}`,
    academicYearId: yearId,
    term,
    name: term === 1 ? "第一学期" : "第二学期",
    startDate: term === 1 ? "2026-09-01" : "2027-02-01",
    endDate: term === 1 ? "2027-01-31" : "2027-07-31",
    isCurrent: term === 1,
    version: 1,
    allowedActions: term === 1 ? ["update"] : ["update", "set-current"],
  })),
});
export const currentAcademicExample = currentAcademicSchema.parse({
  academicYear: academicYearExample,
  semester: academicYearExample.semesters[0],
});

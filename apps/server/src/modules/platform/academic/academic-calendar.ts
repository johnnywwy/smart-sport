import type { UpdateSemester } from "@smart-sport/contracts";

const year = (value: number) => String(value).padStart(4, "0");
/** 日历日期只在边界处转换，避免主机时区改变学年和学期日期。 */
export const academicInstant = (value: string) =>
  new Date(`${value}T00:00:00+08:00`);
export const academicDate = (value: Date) =>
  new Date(value.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

export function defaultAcademicYear(startYear: number) {
  const start = year(startYear),
    next = year(startYear + 1);
  return {
    name: `${start}-${next}学年`,
    startDate: `${start}-09-01`,
    endDate: `${next}-08-31`,
    semesters: [
      {
        term: 1,
        name: "第一学期",
        startDate: `${start}-09-01`,
        endDate: `${next}-01-31`,
      },
      {
        term: 2,
        name: "第二学期",
        startDate: `${next}-02-01`,
        endDate: `${next}-07-31`,
      },
    ],
  };
}
export function semesterDateError(
  input: UpdateSemester,
  term: number,
  bounds: { startDate: string; endDate: string },
  other: { startDate: string; endDate: string },
) {
  if (input.startDate < bounds.startDate)
    return { startDate: ["学期开始日期不能早于所属学年"] };
  if (input.endDate > bounds.endDate)
    return { endDate: ["学期结束日期不能晚于所属学年"] };
  if (input.startDate > input.endDate)
    return { endDate: ["结束日期不能早于开始日期"] };
  if (term === 1 && input.endDate >= other.startDate)
    return { endDate: ["第一学期结束日期必须早于第二学期开始日期"] };
  if (term === 2 && input.startDate <= other.endDate)
    return { startDate: ["第二学期开始日期必须晚于第一学期结束日期"] };
  return null;
}

import { describe, expect, it } from "vitest";
import {
  academicDate,
  academicInstant,
  defaultAcademicYear,
  semesterDateError,
} from "../../src/modules/platform/academic/academic-calendar.js";

describe("学年日历", () => {
  it("跨年日期使用上海零点往返，与宿主时区无关", () => {
    for (const value of [
      "2026-09-01",
      "2027-01-31",
      "2028-02-29",
      "9999-08-31",
    ])
      expect(academicDate(academicInstant(value))).toBe(value);
    expect(academicInstant("2026-09-01").toISOString()).toBe(
      "2026-08-31T16:00:00.000Z",
    );
  });
  it("默认学年覆盖九月至次年八月，两个学期留出暑假空档", () => {
    expect(defaultAcademicYear(2026)).toEqual({
      name: "2026-2027学年",
      startDate: "2026-09-01",
      endDate: "2027-08-31",
      semesters: [
        {
          term: 1,
          name: "第一学期",
          startDate: "2026-09-01",
          endDate: "2027-01-31",
        },
        {
          term: 2,
          name: "第二学期",
          startDate: "2027-02-01",
          endDate: "2027-07-31",
        },
      ],
    });
    expect(defaultAcademicYear(1).startDate).toBe("0001-09-01");
  });
  it("拒绝跨学年、倒置、重叠、颠倒学期顺序，允许寒假", () => {
    const bounds = { startDate: "2026-09-01", endDate: "2027-08-31" };
    const first = { startDate: "2026-09-01", endDate: "2027-01-31" };
    const second = { startDate: "2027-02-20", endDate: "2027-07-09" };
    expect(
      semesterDateError({ ...first, version: 0 }, 1, bounds, second),
    ).toBeNull();
    expect(
      semesterDateError({ ...second, version: 0 }, 2, bounds, first),
    ).toBeNull();
    for (const patch of [
      { startDate: "2026-08-31" },
      { endDate: "2027-09-01" },
      { startDate: "2027-03-01", endDate: "2027-02-01" },
      { endDate: "2027-02-20" },
      { startDate: "2027-06-01", endDate: "2027-07-31" },
    ])
      expect(
        semesterDateError(
          { ...first, ...patch, version: 0 },
          1,
          bounds,
          second,
        ),
      ).not.toBeNull();
    expect(
      semesterDateError(
        { ...second, startDate: first.endDate, version: 0 },
        2,
        bounds,
        first,
      ),
    ).not.toBeNull();
  });
});

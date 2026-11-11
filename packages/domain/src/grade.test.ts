import { describe, expect, it } from "vitest";
import { calculateGrade, type SchoolStage } from "./grade.js";

describe("grade calculation", () => {
  it.each([
    [1, 5],
    [1, 6],
    [2, 3],
    [2, 4],
    [3, 3],
    [4, 3],
    [4, 4],
    [4, 5],
  ] as [SchoolStage, number][])(
    "covers every grade and both boundaries for stage %i, %i years",
    (stage, years) => {
      const base = { stage, years, enrollmentYear: 2022 };
      expect(calculateGrade({ ...base, academicStartYear: 2021 }).status).toBe(
        "not-enrolled",
      );
      for (let index = 0; index < years; index++) {
        expect(
          calculateGrade({ ...base, academicStartYear: 2022 + index }),
        ).toMatchObject({
          status: "enrolled",
          code: stage * 10 + index + 1,
        });
      }
      expect(
        calculateGrade({ ...base, academicStartYear: 2022 + years }).status,
      ).toBe("graduated");
    },
  );
  it("keeps the final year enrolled", () => {
    expect(
      calculateGrade({
        stage: 1,
        years: 5,
        enrollmentYear: 2022,
        academicStartYear: 2026,
      }),
    ).toEqual({ status: "enrolled", code: 15, name: "五年级" });
    expect(
      calculateGrade({
        stage: 1,
        years: 5,
        enrollmentYear: 2021,
        academicStartYear: 2026,
      }).status,
    ).toBe("graduated");
    expect(
      calculateGrade({
        stage: 1,
        years: 6,
        enrollmentYear: 2024,
        academicStartYear: 2026,
      }).name,
    ).toBe("三年级");
  });
  it.each([0, 2, 7, NaN])("rejects unsupported study length %s", (years) => {
    expect(() =>
      calculateGrade({
        stage: 1,
        years,
        enrollmentYear: 2022,
        academicStartYear: 2026,
      }),
    ).toThrow();
  });
  it.each([0, 10000, 2022.5, NaN, Infinity])(
    "rejects invalid year %s",
    (year) => {
      expect(() =>
        calculateGrade({
          stage: 1,
          years: 6,
          enrollmentYear: year,
          academicStartYear: 2026,
        }),
      ).toThrow();
      expect(() =>
        calculateGrade({
          stage: 1,
          years: 6,
          enrollmentYear: 2022,
          academicStartYear: year,
        }),
      ).toThrow();
    },
  );
});

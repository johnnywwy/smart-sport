export type SchoolStage = 1 | 2 | 3 | 4;
export type GradeInput = {
  stage: SchoolStage;
  years: number;
  enrollmentYear: number;
  academicStartYear: number;
};

const stages = {
  1: {
    years: [5, 6],
    names: ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"],
  },
  2: { years: [3, 4], names: ["初一", "初二", "初三", "初四"] },
  3: { years: [3], names: ["高一", "高二", "高三"] },
  4: { years: [3, 4, 5], names: ["大一", "大二", "大三", "大四", "大五"] },
} as const;

export type GradeResult =
  | { status: "not-enrolled"; code: null; name: "未入学" }
  | { status: "graduated"; code: null; name: "已毕业" }
  | { status: "enrolled"; code: number; name: string };

export function calculateGrade(input: GradeInput): GradeResult {
  const stage = stages[input.stage];
  if (!stage || !(stage.years as readonly number[]).includes(input.years)) {
    throw new Error("学段或学制无效");
  }
  for (const year of [input.enrollmentYear, input.academicStartYear]) {
    if (!Number.isInteger(year) || year < 1 || year > 9999)
      throw new Error("年份无效");
  }
  const ordinal = input.academicStartYear - input.enrollmentYear + 1;
  if (ordinal < 1)
    return { status: "not-enrolled", code: null, name: "未入学" };
  if (ordinal > input.years)
    return { status: "graduated", code: null, name: "已毕业" };
  const name = stage.names[ordinal - 1];
  if (!name) throw new Error("年级名称缺失");
  return { status: "enrolled", code: input.stage * 10 + ordinal, name };
}

import {
  type SchoolProfile,
  type UpdateSchoolProfile,
  updateSchoolProfileSchema,
} from "@smart-sport/contracts";

export const stageOptions = [
  { id: 1, name: "小学", years: [5, 6], defaultYears: 6 },
  { id: 2, name: "初中", years: [3, 4], defaultYears: 3 },
  { id: 3, name: "高中", years: [3], defaultYears: 3 },
  { id: 4, name: "大学", years: [3, 4, 5], defaultYears: 4 },
] as const;

export function profileValues(profile: SchoolProfile): UpdateSchoolProfile {
  return {
    version: profile.version,
    schoolCode: profile.schoolCode,
    stages: [...profile.stages],
    stageYears: { ...profile.stageYears },
    nature: profile.nature,
    address: profile.address,
    contactName: profile.contactName,
    // 明确覆盖表单默认空字符串；省略号码才表示保留原密文。
    contactPhone: undefined,
  };
}

/** 仅将空的可选文本转为契约中的 null，所有业务校验仍交给共享契约。 */
export const profileFormSchema = {
  safeParse(input: unknown) {
    if (!input || typeof input !== "object")
      return updateSchoolProfileSchema.safeParse(input);
    const values = input as Record<string, unknown>;
    const result = updateSchoolProfileSchema.safeParse({
      ...values,
      address: values.address === "" ? null : values.address,
      contactName: values.contactName === "" ? null : values.contactName,
    });
    if (result.success) return result;
    return {
      success: false as const,
      error: {
        issues: result.error.issues.map((issue) => ({
          ...issue,
          message:
            issue.path[0] === "stages"
              ? "请选择至少一个学校学段，且学段不能重复"
              : issue.path[0] === "stageYears"
                ? "请为每个已选学段设置对应的有效学制"
                : issue.message,
        })),
      },
    };
  },
};

export function selectedStageYears(
  stages: SchoolProfile["stages"],
  current: SchoolProfile["stageYears"],
) {
  return Object.fromEntries(
    stageOptions
      .filter((stage) => stages.includes(stage.id))
      .map((stage) => [
        String(stage.id),
        current[String(stage.id) as keyof typeof current] ?? stage.defaultYears,
      ]),
  ) as SchoolProfile["stageYears"];
}

export function stageDescription(profile: SchoolProfile) {
  return stageOptions
    .filter((stage) => profile.stages.includes(stage.id))
    .map(
      (stage) =>
        `${stage.name}，${profile.stageYears[String(stage.id) as keyof typeof profile.stageYears]}年制`,
    )
    .join("；");
}

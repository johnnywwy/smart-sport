import { validate } from "uuid";

/** 学校 schema 名只有这一处生成，不能由调用者传入。 */
export function schoolSchemaName(schoolId: string) {
  if (!validate(schoolId)) throw new Error("学校标识无效");
  return `school_${schoolId.toLowerCase().replaceAll("-", "")}`;
}

export function assertSchoolSchemaName(schemaName: string) {
  if (schemaName.length !== 39 || !/^school_[0-9a-f]{32}$/.test(schemaName)) {
    throw new Error("学校库名称无效");
  }
}

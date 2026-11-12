import { ApiError } from "../../errors/api-error";
import type { FormErrors, FormField, FormSchema } from "./types";

export function initialFormValues<T>(
  fields: readonly FormField[],
  initial?: Partial<T>,
) {
  const defaults = Object.fromEntries(
    fields.map((field) => [field.name, field.type === "checkbox" ? false : ""]),
  );
  return { ...defaults, ...initial } as Record<string, unknown>;
}

export function validateForm<T>(
  schema: FormSchema<T>,
  values: Record<string, unknown>,
  fields: readonly FormField[],
  version?: number,
): { success: true; data: T } | { success: false; errors: FormErrors } {
  const parsed = schema.safeParse({
    ...values,
    ...(version === undefined ? {} : { version }),
  });
  if (parsed.success) return parsed;
  const errors: FormErrors = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".") || "_form";
    const field = fields.find((item) => item.name === path);
    const message =
      field?.validationMessage ??
      (issue.message && /[\u3400-\u9fff]/.test(issue.message)
        ? issue.message
        : `请填写有效的${field?.label ?? "内容"}`);
    errors[path] ??= [];
    errors[path].push(message);
  }
  return { success: false, errors };
}

export function formFailure(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 90002)
      return {
        kind: "conflict" as const,
        message: "数据已被他人修改，请重新加载最新数据后再保存。",
      };
    if (error.code === 90003)
      return {
        kind: "duplicate" as const,
        message: "该提交正在处理或已经处理，请刷新列表确认结果，避免重复操作。",
      };
    if (error.fields) return { kind: "fields" as const, errors: error.fields };
    return { kind: "error" as const, message: error.message };
  }
  return { kind: "error" as const, message: "保存失败，请稍后重试。" };
}

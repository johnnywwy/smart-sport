import { fieldErrorsSchema, systemErrors } from "@smart-sport/contracts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | null,
    readonly data: unknown = null,
    readonly traceId: string | null = null,
    message?: string,
  ) {
    const known = Object.entries(systemErrors).find(
      ([key]) => Number(key) === code,
    )?.[1];
    super(
      status >= 500
        ? "系统错误，请稍后重试"
        : (known?.message ?? message ?? "请求失败，请稍后重试"),
    );
    this.name = "ApiError";
  }

  get fields() {
    const parsed = fieldErrorsSchema.safeParse(this.data);
    return parsed.success ? parsed.data.fields : undefined;
  }
}

export class SessionChangedError extends Error {
  constructor() {
    super("会话已变更，已丢弃旧请求");
    this.name = "SessionChangedError";
  }
}

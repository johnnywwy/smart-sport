import type { ApiError } from "./api-error";

export type Parser<T> = { parse: (input: unknown) => T };
export type SessionSnapshot = {
  accessToken: string | null;
  generation: number;
};
export type ApiClientOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  session: {
    get: () => SessionSnapshot;
    refreshToken: (token: string, generation: number) => void;
    clear: () => void;
  };
  onError?: (error: ApiError) => void;
  onUnauthenticated?: () => void;
  onIdentityChanged?: () => void;
  onVersion?: (version: string) => void;
};

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  // 公共认证接口显式关闭令牌注入与自动刷新。
  auth?: boolean;
  // 表单打开时生成一次，重复提交与刷新重试复用同一个键。
  idempotencyKey?: string;
  notify?: boolean;
};

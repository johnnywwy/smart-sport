import { refreshAccessTokenSchema } from "@smart-sport/contracts";
import { ApiError, SessionChangedError } from "./api-error";
import { transport } from "./transport";
import type { ApiClientOptions, ApiRequestOptions, Parser } from "./types";

export const createIdempotencyKey = () => crypto.randomUUID();

export function createApiClient(options: ApiClientOptions) {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 15000;
  let refreshing: { generation: number; promise: Promise<string> } | undefined;
  const assertSession = (generation: number) => {
    if (options.session.get().generation !== generation)
      throw new SessionChangedError();
  };
  const call = (path: string, init: RequestInit) =>
    transport(fetcher, path, init, timeoutMs, options.onVersion);

  function expire(generation: number) {
    assertSession(generation);
    options.session.clear();
    options.onUnauthenticated?.();
  }

  function refresh(silent = false): Promise<string> {
    const { generation } = options.session.get();
    if (refreshing?.generation === generation) return refreshing.promise;
    const promise = (async () => {
      try {
        const data = await call("/api/v1/auth/refresh", { method: "POST" });
        assertSession(generation);
        const { accessToken } = refreshAccessTokenSchema.parse(data);
        options.session.refreshToken(accessToken, generation);
        return accessToken;
      } catch (error) {
        assertSession(generation);
        if (silent) options.session.clear();
        else expire(generation);
        throw error;
      } finally {
        if (refreshing?.generation === generation) refreshing = undefined;
      }
    })();
    refreshing = { generation, promise };
    return promise;
  }

  async function recoverIdentity(generation: number): Promise<never> {
    assertSession(generation);
    options.session.clear();
    const recoveryGeneration = options.session.get().generation;
    await refresh();
    assertSession(recoveryGeneration);
    options.onIdentityChanged?.();
    throw new SessionChangedError();
  }

  async function request<T>(
    path: string,
    schema: Parser<T>,
    requestOptions: ApiRequestOptions = {},
  ): Promise<T> {
    // 仅接受同源 API 路径，防止令牌被调用者传入的外部 URL 带走。
    if (
      !/^\/api\/v1\/[^?#\\]+(?:[?][^#\\]*)?$/.test(path) ||
      path.includes("..")
    ) {
      throw new Error("只允许请求 /api/v1/ 下的同源接口");
    }
    if (path.split("?")[0] === "/api/v1/auth/refresh")
      throw new Error("请使用 refresh() 刷新令牌");
    const authenticated = requestOptions.auth !== false;
    const snapshot = options.session.get();
    const method = requestOptions.method ?? "GET";
    const body =
      requestOptions.body === undefined
        ? undefined
        : JSON.stringify(requestOptions.body);
    // 自动重试保留同一请求体与键；跨次提交由表单显式传入 key。
    const idempotencyKey =
      requestOptions.idempotencyKey ??
      (method === "POST" ? createIdempotencyKey() : undefined);
    const ensureCurrent = () => {
      requestOptions.signal?.throwIfAborted();
      if (authenticated) assertSession(snapshot.generation);
    };
    async function attempt(token: string | null) {
      ensureCurrent();
      const headers = new Headers({ Accept: "application/json" });
      if (body !== undefined) headers.set("Content-Type", "application/json");
      if (authenticated && token)
        headers.set("Authorization", `Bearer ${token}`);
      if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
      return call(path, {
        method,
        headers,
        ...(body !== undefined ? { body } : {}),
        ...(requestOptions.signal ? { signal: requestOptions.signal } : {}),
      });
    }
    try {
      let data: unknown;
      try {
        data = await attempt(snapshot.accessToken);
      } catch (error) {
        ensureCurrent();
        if (
          !(error instanceof ApiError) ||
          error.status !== 401 ||
          (error.code !== null &&
            error.code !== 10005 &&
            error.code !== 11005) ||
          !authenticated
        )
          throw error;
        if (error.code === 11005) {
          return recoverIdentity(snapshot.generation);
        }
        // 迟到的 401 可直接复用已经刷新的令牌，避免再次轮换 Cookie。
        const currentToken = options.session.get().accessToken;
        const token =
          currentToken && currentToken !== snapshot.accessToken
            ? currentToken
            : await refresh();
        ensureCurrent();
        try {
          data = await attempt(token);
        } catch (retryError) {
          ensureCurrent();
          if (retryError instanceof ApiError && retryError.status === 401) {
            if (retryError.code === 11005)
              return recoverIdentity(snapshot.generation);
            expire(snapshot.generation);
          }
          throw retryError;
        }
      }
      ensureCurrent();
      try {
        return schema.parse(data);
      } catch {
        throw new ApiError(
          502,
          null,
          null,
          null,
          "服务响应格式异常，请稍后重试",
        );
      }
    } catch (error) {
      if (error instanceof ApiError && requestOptions.notify !== false)
        options.onError?.(error);
      throw error;
    }
  }

  return { request, refresh };
}

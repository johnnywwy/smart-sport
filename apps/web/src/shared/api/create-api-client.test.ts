import { livenessSchema } from "@smart-sport/contracts";
import { describe, expect, it, vi } from "vitest";
import { ApiError, SessionChangedError } from "./api-error";
import { createApiClient, createIdempotencyKey } from "./create-api-client";

const success = (data: unknown = { status: "alive" }, headers = {}) =>
  Response.json(
    { code: 0, message: "ok", data, traceId: "test-trace" },
    { headers },
  );
const failure = (status = 401, code = 10005, data: unknown = null) =>
  Response.json(
    { code, message: "测试错误", data, traceId: "test-trace" },
    { status },
  );
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(
  handler: (url: string, init: RequestInit) => Promise<Response> | Response,
  timeoutMs = 1000,
) {
  let state = { accessToken: "old-token" as string | null, generation: 0 };
  const fetcher = vi.fn<typeof fetch>((input, init) =>
    Promise.resolve(handler(String(input), init ?? {})),
  );
  const callbacks = {
    onError: vi.fn(),
    onUnauthenticated: vi.fn(),
    onIdentityChanged: vi.fn(),
    onVersion: vi.fn(),
  };
  const session = {
    get: () => state,
    refreshToken: (accessToken: string, generation: number) => {
      if (generation === state.generation) state = { ...state, accessToken };
    },
    clear: () => {
      state = { accessToken: null, generation: state.generation + 1 };
    },
  };
  const api = createApiClient({
    fetch: fetcher,
    session,
    timeoutMs,
    ...callbacks,
  });
  return { api, fetcher, session, ...callbacks };
}

const endpoint = "/api/v1/example";

describe("API 客户端", () => {
  it("注入内存令牌、同源 Cookie 并按契约解析数据", async () => {
    const { api, fetcher } = setup(() => success());
    expect(await api.request(endpoint, livenessSchema)).toEqual({
      status: "alive",
    });
    const init = fetcher.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer old-token",
    );
    expect(init).toMatchObject({
      credentials: "same-origin",
      redirect: "error",
    });
  });

  it("401 只刷新一次，携带新令牌重试且保留提交体和幂等键", async () => {
    const { api, fetcher } = setup((url, init) =>
      url.endsWith("/auth/refresh")
        ? success({ accessToken: "new-token" })
        : new Headers(init.headers).get("Authorization") === "Bearer old-token"
          ? failure()
          : success(),
    );
    const key = createIdempotencyKey();
    await api.request(endpoint, livenessSchema, {
      method: "POST",
      body: { version: 1 },
      idempotencyKey: key,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    const first = fetcher.mock.calls[0]?.[1];
    const refresh = fetcher.mock.calls[1]?.[1];
    const retry = fetcher.mock.calls[2]?.[1];
    expect(refresh?.headers).toBeUndefined();
    expect(first?.body).toBe(retry?.body);
    expect(new Headers(retry?.headers).get("Idempotency-Key")).toBe(key);
    expect(new Headers(retry?.headers).get("Authorization")).toBe(
      "Bearer new-token",
    );
  });

  it("并发 401 共用一个刷新，迟到的 401 复用已刷新的令牌", async () => {
    const refreshGate = deferred<Response>();
    const slowRequest = deferred<Response>();
    let oldCalls = 0;
    const { api, fetcher } = setup((url, init) => {
      if (url.endsWith("/auth/refresh")) return refreshGate.promise;
      if (new Headers(init.headers).get("Authorization") !== "Bearer old-token")
        return success();
      oldCalls++;
      return oldCalls === 3 ? slowRequest.promise : failure();
    });
    const requests = [
      api.request(endpoint, livenessSchema),
      api.request(endpoint, livenessSchema),
      api.request(endpoint, livenessSchema),
    ];
    await vi.waitFor(() =>
      expect(
        fetcher.mock.calls.filter(([url]) =>
          String(url).endsWith("/auth/refresh"),
        ),
      ).toHaveLength(1),
    );
    refreshGate.resolve(success({ accessToken: "new-token" }));
    await requests[0];
    slowRequest.resolve(failure());
    await Promise.all(requests);
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).endsWith("/auth/refresh"),
      ),
    ).toHaveLength(1);
  });

  it("刷新失败清除会话并回登录，不递归刷新", async () => {
    const { api, fetcher, session, onUnauthenticated } = setup(() => failure());
    await expect(api.request(endpoint, livenessSchema)).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(session.get().accessToken).toBeNull();
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it("刷新后的请求仍为 401 时终止并回登录", async () => {
    const { api, fetcher, onUnauthenticated } = setup((url) =>
      url.endsWith("/auth/refresh")
        ? success({ accessToken: "new-token" })
        : failure(),
    );
    await expect(api.request(endpoint, livenessSchema)).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it("公共登录失败不自动刷新、不携带令牌", async () => {
    const { api, fetcher, onUnauthenticated } = setup(() =>
      failure(401, 10001),
    );
    await expect(
      api.request("/api/v1/auth/login", livenessSchema, {
        method: "POST",
        auth: false,
      }),
    ).rejects.toMatchObject({ code: 10001 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).has("Authorization"),
    ).toBe(false);
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it.each([
    [403, 11101],
    [404, 90004],
    [409, 90002],
    [429, 90005],
  ])("HTTP %s 直接抛业务错误且不刷新", async (status, code) => {
    const { api, fetcher, onError } = setup(() => failure(status, code));
    await expect(api.request(endpoint, livenessSchema)).rejects.toMatchObject({
      status,
      code,
      traceId: "test-trace",
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("保留字段错误供表单消费，支持关闭全局提示", async () => {
    const { api, onError } = setup(() =>
      failure(400, 90001, { fields: { name: ["请输入名称"] } }),
    );
    await expect(
      api.request(endpoint, livenessSchema, { notify: false }),
    ).rejects.toMatchObject({ fields: { name: ["请输入名称"] } });
    expect(onError).not.toHaveBeenCalled();
  });

  it("成功信封中的业务数据仍需符合接口契约", async () => {
    const { api } = setup(() => success({ unexpected: true }));
    await expect(api.request(endpoint, livenessSchema)).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("非 JSON 响应转换成统一错误", async () => {
    const { api } = setup(() => new Response("gateway error", { status: 502 }));
    await expect(api.request(endpoint, livenessSchema)).rejects.toMatchObject({
      status: 502,
      code: null,
    });
  });

  it("网络错误提供中文提示且不重试写操作", async () => {
    const { api, fetcher } = setup(() => {
      throw new TypeError("fetch failed");
    });
    await expect(
      api.request(endpoint, livenessSchema, { method: "POST" }),
    ).rejects.toMatchObject({ status: 0, message: "网络连接失败，请稍后重试" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("退出后旧请求成功结果被丢弃", async () => {
    const gate = deferred<Response>();
    const { api, session, onError } = setup(() => gate.promise);
    const pending = api.request(endpoint, livenessSchema);
    session.clear();
    gate.resolve(success());
    await expect(pending).rejects.toBeInstanceOf(SessionChangedError);
    expect(onError).not.toHaveBeenCalled();
  });

  it("退出时正在刷新的请求不能恢复旧令牌", async () => {
    const gate = deferred<Response>();
    const { api, session, fetcher } = setup((url) =>
      url.endsWith("/auth/refresh") ? gate.promise : failure(),
    );
    const pending = api.request(endpoint, livenessSchema);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    session.clear();
    gate.resolve(success({ accessToken: "stale-token" }));
    await expect(pending).rejects.toBeInstanceOf(SessionChangedError);
    expect(session.get().accessToken).toBeNull();
  });

  it("11005 恢复当前会话并回门户，不重放原写操作", async () => {
    const { api, fetcher, onIdentityChanged, session } = setup((url) =>
      url.endsWith("/auth/refresh")
        ? success({ accessToken: "current-identity-token" })
        : failure(401, 11005),
    );
    await expect(
      api.request(endpoint, livenessSchema, { method: "POST" }),
    ).rejects.toBeInstanceOf(SessionChangedError);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(session.get().accessToken).toBe("current-identity-token");
    expect(onIdentityChanged).toHaveBeenCalledOnce();
  });

  it("取消请求不产生错误提示或刷新", async () => {
    const controller = new AbortController();
    controller.abort();
    const { api, fetcher, onError } = setup(() => success());
    await expect(
      api.request(endpoint, livenessSchema, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("取消某个等待者不会取消其他请求共用的刷新", async () => {
    const gate = deferred<Response>();
    const controller = new AbortController();
    const { api, fetcher } = setup((url, init) =>
      url.endsWith("/auth/refresh")
        ? gate.promise
        : new Headers(init.headers).get("Authorization") === "Bearer old-token"
          ? failure()
          : success(),
    );
    const first = api.request(endpoint, livenessSchema, {
      signal: controller.signal,
    });
    const second = api.request(endpoint, livenessSchema);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    controller.abort();
    gate.resolve(success({ accessToken: "new-token" }));
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).resolves.toEqual({ status: "alive" });
  });

  it("超时终止请求", async () => {
    const { api } = setup(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          ),
        ),
      10,
    );
    await expect(api.request(endpoint, livenessSchema)).rejects.toMatchObject({
      message: "请求超时，请稍后重试",
    });
  });

  it("接收版本响应头", async () => {
    const { api, onVersion } = setup(() =>
      success(undefined, { "X-App-Version": "release-2" }),
    );
    await api.request(endpoint, livenessSchema);
    expect(onVersion).toHaveBeenCalledWith("release-2");
  });

  it.each([
    "https://example.com/api/v1/test",
    "//example.com/api/v1/test",
    "/api/v1/../auth",
    "/api/v1/test\\evil",
    "/api/v1/auth/refresh",
  ])("拒绝危险或绕过刷新逻辑的路径 %s", async (path) => {
    const { api, fetcher } = setup(() => success());
    await expect(api.request(path, livenessSchema)).rejects.toBeInstanceOf(
      Error,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("默认生成的幂等键在刷新重试中不变，不同提交使用不同键", async () => {
    const { api, fetcher } = setup((url, init) =>
      url.endsWith("/auth/refresh")
        ? success({ accessToken: "new-token" })
        : new Headers(init.headers).get("Authorization") === "Bearer old-token"
          ? failure()
          : success(),
    );
    await api.request(endpoint, livenessSchema, { method: "POST" });
    await api.request(endpoint, livenessSchema, { method: "POST" });
    const keys = fetcher.mock.calls
      .filter(([url]) => url === endpoint)
      .map(([, init]) => new Headers(init?.headers).get("Idempotency-Key"));
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("刷新响应缺少令牌时清除会话且不重试业务请求", async () => {
    const { api, fetcher, session, onUnauthenticated } = setup((url) =>
      url.endsWith("/auth/refresh") ? success({}) : failure(),
    );
    await expect(api.request(endpoint, livenessSchema)).rejects.toBeInstanceOf(
      Error,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(session.get().accessToken).toBeNull();
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it("重试期间发生 11005 仍按身份切换处理", async () => {
    let refreshes = 0;
    const { api, fetcher, onIdentityChanged, onUnauthenticated } = setup(
      (url) => {
        if (url.endsWith("/auth/refresh")) {
          refreshes++;
          return success({ accessToken: `renewed-${refreshes}` });
        }
        return refreshes ? failure(401, 11005) : failure();
      },
    );
    await expect(
      api.request(endpoint, livenessSchema, { method: "POST" }),
    ).rejects.toBeInstanceOf(SessionChangedError);
    expect(fetcher.mock.calls.filter(([url]) => url === endpoint)).toHaveLength(
      2,
    );
    expect(onIdentityChanged).toHaveBeenCalledOnce();
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it("HTTP 200 中的失败业务码仍作为错误处理", async () => {
    const { api, fetcher } = setup(() => failure(200, 90002));
    await expect(api.request(endpoint, livenessSchema)).rejects.toMatchObject({
      code: 90002,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe("认证业务失败不刷新会话", () => {
  it.each([10001, 10002, 10003, 10004])(
    "错误 %s 直接交给表单，保留当前会话",
    async (code) => {
      const { api, fetcher, session, onUnauthenticated } = setup(() =>
        failure(401, code),
      );
      await expect(
        api.request("/api/v1/auth/change-password", livenessSchema, {
          method: "POST",
          body: {},
          notify: false,
        }),
      ).rejects.toMatchObject({ code });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(onUnauthenticated).not.toHaveBeenCalled();
      expect(session.get().accessToken).toBe("old-token");
    },
  );
});

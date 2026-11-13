import { livenessSchema } from "@smart-sport/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionChangedError } from "./api-error";
import { createApiClient } from "./create-api-client";
import { withRefreshLock } from "./refresh-lock";

const success = (data: unknown) =>
  Response.json({ code: 0, message: "ok", data, traceId: "refresh-test" });
const failure = () =>
  Response.json(
    { code: 10005, message: "会话已失效", data: null, traceId: "refresh-test" },
    { status: 401 },
  );
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function browserLocks() {
  let queue = Promise.resolve();
  const request = vi.fn((_name: string, run: () => Promise<unknown>) => {
    const result = queue.then(run);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  });
  vi.stubGlobal("navigator", { locks: { request } });
  return request;
}
function tab(fetcher: typeof fetch) {
  let state = { accessToken: null as string | null, generation: 0 };
  const session = {
    get: () => state,
    refreshToken: (accessToken: string, generation: number) => {
      if (state.generation === generation) state = { ...state, accessToken };
    },
    clear: () => {
      state = { accessToken: null, generation: state.generation + 1 };
    },
  };
  const onUnauthenticated = vi.fn();
  const api = createApiClient({ fetch: fetcher, session, onUnauthenticated });
  return { api, session, onUnauthenticated };
}
afterEach(() => vi.unstubAllGlobals());

describe("跨标签页刷新", () => {
  it("两个独立客户端依次消费共享 Cookie，各自获取内存令牌并完成业务请求", async () => {
    const locks = browserLocks();
    const firstResponse = gate();
    let cookie = 0;
    const consumed = new Set<number>();
    const observedCookies: number[] = [];
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (url !== "/api/v1/auth/refresh") {
        return new Headers(init?.headers).has("Authorization")
          ? success({ status: "alive" })
          : failure();
      }
      const sentCookie = cookie;
      observedCookies.push(sentCookie);
      if (consumed.has(sentCookie)) return failure();
      consumed.add(sentCookie);
      if (sentCookie === 0) await firstResponse.promise;
      cookie++;
      return success({ accessToken: `tab-token-${cookie}` });
    });
    const first = tab(fetcher);
    const second = tab(fetcher);
    const done = Promise.all([
      first.api.request("/api/v1/example", livenessSchema),
      second.api.request("/api/v1/example", livenessSchema),
    ]);
    await vi.waitFor(() => expect(locks).toHaveBeenCalledTimes(2));
    expect(observedCookies).toEqual([0]);
    firstResponse.release();
    await expect(done).resolves.toEqual([
      { status: "alive" },
      { status: "alive" },
    ]);
    expect(observedCookies).toEqual([0, 1]);
    expect(first.session.get().accessToken).toBe("tab-token-1");
    expect(second.session.get().accessToken).toBe("tab-token-2");
    expect(new Set(locks.mock.calls.map(([name]) => name)).size).toBe(1);
    expect(first.onUnauthenticated).not.toHaveBeenCalled();
    expect(second.onUnauthenticated).not.toHaveBeenCalled();
  });

  it("等待锁时退出，旧任务不再消费 Cookie，也不恢复已清空的会话", async () => {
    const locks = browserLocks();
    const response = gate();
    const fetcher = vi.fn<typeof fetch>(async () => {
      await response.promise;
      return success({ accessToken: "first-tab-token" });
    });
    const first = tab(fetcher);
    const second = tab(fetcher);
    const done = Promise.allSettled([
      first.api.refresh(),
      second.api.refresh(),
    ]);
    await vi.waitFor(() => expect(locks).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenCalledOnce();
    second.session.clear();
    response.release();
    const results = await done;
    expect(results[0]).toMatchObject({ status: "fulfilled" });
    expect(results[1]).toMatchObject({
      status: "rejected",
      reason: expect.any(SessionChangedError),
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(second.session.get()).toEqual({
      accessToken: null,
      generation: 1,
    });
    expect(second.onUnauthenticated).not.toHaveBeenCalled();
  });

  it("刷新失败仍释放锁，另一标签页能继续刷新；失败页按原规则清理", async () => {
    browserLocks();
    let calls = 0;
    const fetcher = vi.fn<typeof fetch>(async () =>
      ++calls === 1
        ? Response.json(
            {
              code: 90500,
              message: "系统错误",
              data: null,
              traceId: "refresh-test",
            },
            { status: 500 },
          )
        : success({ accessToken: "second-tab-token" }),
    );
    const first = tab(fetcher);
    const second = tab(fetcher);
    const results = await Promise.allSettled([
      first.api.refresh(),
      second.api.refresh(),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "rejected",
      "fulfilled",
    ]);
    expect(first.session.get().accessToken).toBeNull();
    expect(first.onUnauthenticated).toHaveBeenCalledOnce();
    expect(second.session.get().accessToken).toBe("second-tab-token");
    expect(second.onUnauthenticated).not.toHaveBeenCalled();
  });

  it("缺少 Web Locks 时保留单页刷新与原错误处理", async () => {
    vi.stubGlobal("navigator", {});
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(success({ accessToken: "single-tab-token" })),
    );
    const first = tab(fetcher);
    await expect(
      Promise.all([first.api.refresh(), first.api.refresh()]),
    ).resolves.toEqual(["single-tab-token", "single-tab-token"]);
    expect(fetcher).toHaveBeenCalledOnce();
    vi.stubGlobal("navigator", undefined);
    await expect(withRefreshLock(async () => "server-test")).resolves.toBe(
      "server-test",
    );
  });
});

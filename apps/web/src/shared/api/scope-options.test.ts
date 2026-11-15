import { scopeOptionSchema } from "@smart-sport/contracts";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./client";
import {
  requestScopeBranch,
  requestScopeOptions,
  scopeOptionsKey,
} from "./scope-options";

vi.mock("./client", () => ({ apiClient: { request: vi.fn() } }));
afterEach(() => vi.clearAllMocks());
const emptyPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  allowedTypes: ["region", "school"] as const,
};
const actor = "019483c0-0000-7000-8000-000000000001";
const org = "019483c0-0000-7000-8000-000000000002";

describe("范围候选查询", () => {
  it("只请求边界候选接口，传递组织、字面搜索和取消信号", async () => {
    vi.mocked(apiClient.request).mockResolvedValue(emptyPage);
    const signal = new AbortController().signal;
    await requestScopeOptions(
      { type: "school", keyword: "%_学校", page: 2, pageSize: 20, orgId: org },
      signal,
    );
    const call = vi.mocked(apiClient.request).mock.calls[0];
    if (!call) throw new Error("未发起候选请求");
    const [path, , options] = call;
    const query = new URL(String(path), "http://local.test");
    expect(query.pathname).toBe("/api/v1/scope-options");
    expect(query.searchParams.get("keyword")).toBe("%_学校");
    expect(query.searchParams.get("orgId")).toBe(org);
    expect(query.searchParams.get("page")).toBe("2");
    expect(options?.signal).toBe(signal);
  });
  it("区划分支读取所有分页，不伪装为完整的首100条", async () => {
    const request = vi.mocked(apiClient.request);
    const items = Array.from({ length: 101 }, (_, index) =>
      scopeOptionSchema.parse({
        type: "region",
        value: String(330101 + index),
        name: `测试地区${index + 1}`,
        available: true,
        parentValue: "330000",
      }),
    );
    request.mockResolvedValueOnce({
      ...emptyPage,
      total: 101,
      pageSize: 100,
      items: items.slice(0, 100),
    });
    request.mockResolvedValueOnce({
      ...emptyPage,
      total: 101,
      pageSize: 100,
      page: 2,
      items: items.slice(100),
    });
    const result = await requestScopeBranch(
      org,
      "330000",
      new AbortController().signal,
    );
    expect(result.items).toEqual(items);
    expect(request).toHaveBeenCalledTimes(2);
    expect(
      request.mock.calls.every(([path]) => path.includes("parent=330000")),
    ).toBe(true);
    expect(request.mock.calls[1]?.[0]).toContain("page=2");
  });
  it("加载分支期间被取消则不继续翻页或返回部分数据", async () => {
    const abort = new AbortController();
    vi.mocked(apiClient.request).mockImplementationOnce(async () => {
      abort.abort();
      return { ...emptyPage, total: 101, pageSize: 100 };
    });
    await expect(
      requestScopeBranch(undefined, null, abort.signal),
    ).rejects.toThrow();
    expect(apiClient.request).toHaveBeenCalledTimes(1);
  });
  it("缓存按身份、组织、搜索和页码隔离，晚到搜索不覆盖新查询", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const base = { type: "school" as const, page: 1, pageSize: 20 };
    const first = scopeOptionsKey(actor, { ...base, keyword: "甲" });
    const second = scopeOptionsKey(actor, { ...base, keyword: "乙" });
    let finish: (value: string) => void = () => {};
    const slow = client.fetchQuery({
      queryKey: first,
      queryFn: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    });
    await client.fetchQuery({
      queryKey: second,
      queryFn: async () => "乙结果",
    });
    finish("甲结果");
    await slow;
    expect(client.getQueryData(second)).toBe("乙结果");
    expect(
      client.getQueryData(
        scopeOptionsKey(actor, { ...base, orgId: org, keyword: "乙" }),
      ),
    ).toBeUndefined();
    expect(
      client.getQueryData(scopeOptionsKey(org, { ...base, keyword: "乙" })),
    ).toBeUndefined();
    expect(
      client.getQueryData(
        scopeOptionsKey(actor, { ...base, page: 2, keyword: "乙" }),
      ),
    ).toBeUndefined();
    client.clear();
  });
});

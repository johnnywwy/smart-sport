import { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../../../shared/api/client", () => ({
  apiClient: { request },
}));

import { ApiError } from "../../../../shared/errors/api-error";
import { numberRuleExample } from "../__tests__/fixtures";
import { numberRulesOptions, saveNumberRule } from "./number-requests";

beforeEach(() => {
  request.mockReset();
});
it("编号规则查询按身份隔离，传取消信号，列表失败交给页面处理", async () => {
  request.mockResolvedValue([numberRuleExample]);
  const client = new QueryClient();
  await client.fetchQuery(numberRulesOptions("first"));
  await client.fetchQuery(numberRulesOptions("second"));
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[0]?.[2]).toMatchObject({ notify: false });
  expect(request.mock.calls[0]?.[2].signal).toBeInstanceOf(AbortSignal);
  expect(numberRulesOptions("first").queryKey).not.toEqual(
    numberRulesOptions("second").queryKey,
  );
  client.clear();
});
it("保存携带完整配置、版本、幂等键与取消信号，冲突继续抛给表单", async () => {
  const context = {
    idempotencyKey: crypto.randomUUID(),
    signal: new AbortController().signal,
  };
  const values = {
    version: 4,
    prefix: "KT",
    digits: 7,
    reset: "never" as const,
  };
  request.mockResolvedValue(numberRuleExample);
  await saveNumberRule(numberRuleExample.id, values, context);
  expect(request.mock.calls[0]).toMatchObject([
    `/api/v1/number-rules/${numberRuleExample.id}`,
    expect.anything(),
    { method: "PATCH", body: values, ...context },
  ]);
  const conflict = new ApiError(409, 90002);
  request.mockRejectedValue(conflict);
  await expect(
    saveNumberRule(numberRuleExample.id, values, context),
  ).rejects.toBe(conflict);
});
it("非法前缀或超限位数由共享契约在请求前拒绝", () => {
  const context = {
    idempotencyKey: "key",
    signal: new AbortController().signal,
  };
  for (const values of [
    { version: 1, prefix: "zx", digits: 6, reset: "yearly" as const },
    { version: 1, prefix: "ZX", digits: 13, reset: "yearly" as const },
  ])
    expect(() =>
      saveNumberRule(numberRuleExample.id, values, context),
    ).toThrow();
  expect(request).not.toHaveBeenCalled();
});

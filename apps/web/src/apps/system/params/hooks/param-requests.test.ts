import { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../../../shared/api/client", () => ({ apiClient: { request } }));

import { ApiError } from "../../../../shared/errors/api-error";
import { paramRows } from "../__tests__/fixtures";
import { initialParamQuery } from "../param-state";
import { paramOptions, paramsOptions, saveParam } from "./param-requests";

beforeEach(() => {
  request.mockReset();
});
it("列表缓存包含身份及查询，详情按ID重载且传递取消信号", async () => {
  const row = paramRows[0];
  if (!row) throw new Error("缺少参数");
  request.mockResolvedValue({
    items: paramRows,
    total: 8,
    page: 1,
    pageSize: 20,
  });
  const client = new QueryClient();
  await client.fetchQuery(paramsOptions("first", initialParamQuery));
  await client.fetchQuery(paramsOptions("second", initialParamQuery));
  expect(request).toHaveBeenCalledTimes(2);
  expect(paramsOptions("first", initialParamQuery).queryKey).not.toEqual(
    paramsOptions("first", { ...initialParamQuery, keyword: "密码" }).queryKey,
  );
  request.mockResolvedValue(row);
  await client.fetchQuery(paramOptions("first", row.id));
  expect(request.mock.calls[2]?.[0]).toBe(`/api/v1/system-params/${row.id}`);
  for (const call of request.mock.calls) {
    expect(call[2]).toMatchObject({ notify: false });
    expect(call[2].signal).toBeInstanceOf(AbortSignal);
  }
  expect(paramOptions("first", row.id).queryKey).not.toEqual(
    paramOptions("second", row.id).queryKey,
  );
  client.clear();
});
it("保存仅提交整数值、版本及去空白原因，携带取消及幂等上下文", async () => {
  const row = paramRows[0];
  if (!row) throw new Error("缺少参数");
  const context = {
    idempotencyKey: "review",
    signal: new AbortController().signal,
  };
  request.mockResolvedValue(row);
  await saveParam(
    row.id,
    { value: 12, version: 2, reason: " 安全要求 " },
    context,
  );
  expect(request.mock.calls[0]).toMatchObject([
    `/api/v1/system-params/${row.id}`,
    expect.anything(),
    {
      method: "PATCH",
      body: { value: 12, version: 2, reason: "安全要求" },
      ...context,
    },
  ]);
  const conflict = new ApiError(409, 90002);
  request.mockRejectedValue(conflict);
  await expect(
    saveParam(row.id, { value: 12, version: 2, reason: "安全要求" }, context),
  ).rejects.toBe(conflict);
});
it("非法请求在发出前拒绝，详情重载失败保留原始错误", async () => {
  const context = {
    idempotencyKey: "review",
    signal: new AbortController().signal,
  };
  for (const values of [
    { value: 1.5, version: 0, reason: "原因" },
    { value: 8, version: 0, reason: " " },
    { value: 8, version: -1, reason: "原因" },
  ])
    expect(() => saveParam("id", values, context)).toThrow();
  expect(request).not.toHaveBeenCalled();
  const failure = new ApiError(404, 90004);
  request.mockRejectedValue(failure);
  const client = new QueryClient();
  await expect(
    client.fetchQuery(paramOptions("actor", "missing")),
  ).rejects.toBe(failure);
  client.clear();
});

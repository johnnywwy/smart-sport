import { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../../../shared/api/client", () => ({ apiClient: { request } }));

import { ApiError } from "../../../../shared/errors/api-error";
import { initialAuditQuery } from "../audit-state";
import { auditOptions } from "./audit-requests";

beforeEach(() => {
  request.mockReset();
});
it("身份和平台/组织范围隔离缓存，请求传递取消信号并使用真实接口", async () => {
  const client = new QueryClient();
  request.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
  for (const options of [
    auditOptions("first", "platform", initialAuditQuery),
    auditOptions("first", "organization", initialAuditQuery),
    auditOptions("second", "organization", initialAuditQuery),
  ])
    await client.fetchQuery(options);
  expect(request).toHaveBeenCalledTimes(3);
  expect(request.mock.calls[0]?.[0]).toContain("/api/v1/audit-logs?");
  expect(request.mock.calls[0]?.[0]).toContain("scope=platform");
  expect(request.mock.calls[1]?.[0]).toContain("scope=organization");
  for (const call of request.mock.calls) {
    expect(call[2]).toMatchObject({ notify: false });
    expect(call[2].signal).toBeInstanceOf(AbortSignal);
  }
  expect(
    auditOptions("first", "platform", initialAuditQuery).queryKey,
  ).not.toEqual(
    auditOptions("first", "platform", {
      ...initialAuditQuery,
      filters: { action: "auth.login" },
    }).queryKey,
  );
  client.clear();
});
it("撤权403不会重试或复用其他范围缓存，查询失败保留原始错误", async () => {
  const client = new QueryClient();
  const failure = new ApiError(403, 11101);
  request.mockRejectedValue(failure);
  await expect(
    client.fetchQuery(auditOptions("actor", "platform", initialAuditQuery)),
  ).rejects.toBe(failure);
  expect(request).toHaveBeenCalledTimes(1);
  expect(
    client.getQueryData(
      auditOptions("actor", "organization", initialAuditQuery).queryKey,
    ),
  ).toBeUndefined();
  client.clear();
});

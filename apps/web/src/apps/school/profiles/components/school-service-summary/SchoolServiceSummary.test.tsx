import { schoolAppsSchema, subscriptionExamples } from "@smart-sport/contracts";
import { QueryClient } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../../../../shared/api/client", () => ({ apiClient: { request } }));

import { schoolServiceOptions } from "../../hooks/use-school-service";
import { SchoolServiceSummary } from "./SchoolServiceSummary";

it("展示真实到期与宽限信息，用模块名称而非应用编码，不显示学校技术ID", () => {
  const service = schoolAppsSchema.parse(subscriptionExamples.apps);
  const markup = renderToStaticMarkup(
    <SchoolServiceSummary
      service={service}
      loading={false}
      error={false}
      onRetry={() => {}}
    />,
  );
  expect(markup).toContain("宽限期");
  expect(markup).toContain("2026-11-19");
  expect(markup).toContain("2026-11-21");
  expect(markup).toContain("基础信息");
  expect(markup).not.toContain(service.schoolId);
  expect(markup).not.toContain("平台管理");
});
it("未开通、加载及失败状态不编造服务期或已开通模块", () => {
  for (const [loading, error] of [
    [true, false],
    [false, true],
  ]) {
    const markup = renderToStaticMarkup(
      <SchoolServiceSummary
        service={undefined}
        loading={loading ?? false}
        error={error ?? false}
        onRetry={() => {}}
      />,
    );
    expect(markup).not.toContain("服务中");
    expect(markup).not.toContain("到期日");
    expect(markup).toContain(loading ? "正在加载服务信息" : "服务信息加载失败");
  }
  const markup = renderToStaticMarkup(
    <SchoolServiceSummary
      service={{
        schoolId: subscriptionExamples.apps.schoolId,
        status: "suspended",
        serviceEnd: null,
        graceEnd: null,
        accessMode: "unavailable",
        apps: [],
      }}
      loading={false}
      error={false}
      onRetry={() => {}}
    />,
  );
  expect(markup).toContain("尚未开通服务");
  expect(markup).toContain("暂无可用模块");
  expect(markup).not.toContain("到期日");
});
it("服务请求带取消信号，缓存按身份及学校隔离", async () => {
  const service = subscriptionExamples.apps;
  request.mockResolvedValueOnce(service);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const data = await client.fetchQuery(
    schoolServiceOptions("identity", service.schoolId),
  );
  expect(data).toEqual(service);
  expect(request.mock.calls[0]?.[0]).toBe(
    `/api/v1/schools/${service.schoolId}/apps`,
  );
  expect(request.mock.calls[0]?.[2]?.signal).toBeInstanceOf(AbortSignal);
  expect(
    client.getQueryData(
      schoolServiceOptions("other", service.schoolId).queryKey,
    ),
  ).toBeUndefined();
  expect(
    client.getQueryData(
      schoolServiceOptions("identity", "other-school").queryKey,
    ),
  ).toBeUndefined();
  client.clear();
});

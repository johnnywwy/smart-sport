import { moduleNavigationExamples } from "@smart-sport/contracts";
import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../api/client", () => ({ apiClient: { request } }));

import { availableModulesOptions, moduleMenusOptions } from "./use-modules";

it("模块与菜单查询以身份隔离并传递取消信号", async () => {
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  request
    .mockResolvedValueOnce(moduleNavigationExamples.modules)
    .mockResolvedValueOnce(moduleNavigationExamples.menus);
  expect(await query.fetchQuery(availableModulesOptions("teacher"))).toEqual(
    moduleNavigationExamples.modules,
  );
  expect(await query.fetchQuery(moduleMenusOptions("teacher", "base"))).toEqual(
    moduleNavigationExamples.menus,
  );
  expect(request.mock.calls[0]?.[0]).toBe("/api/v1/modules/available");
  expect(request.mock.calls[1]?.[0]).toBe("/api/v1/menus/current?module=base");
  expect(request.mock.calls[1]?.[2]?.signal).toBeInstanceOf(AbortSignal);
  expect(
    query.getQueryData(availableModulesOptions("other").queryKey),
  ).toBeUndefined();
  expect(moduleMenusOptions("teacher", undefined).enabled).toBe(false);
  query.clear();
});

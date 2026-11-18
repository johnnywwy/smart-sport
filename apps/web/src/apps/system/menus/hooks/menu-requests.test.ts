import { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../../../shared/api/client", () => ({ apiClient: { request } }));

import { menuOverrideExamples } from "@smart-sport/contracts";
import { ApiError } from "../../../../shared/errors/api-error";
import { initialMenuQuery } from "../menu-state";
import { allMenus, menusOptions, saveMenus } from "./menu-requests";

beforeEach(() => request.mockReset());
it("查询缓存隔离身份模块与分页，并传递取消信号", async () => {
  request.mockResolvedValue(menuOverrideExamples.list);
  const client = new QueryClient();
  await client.fetchQuery(menusOptions("first", "base", initialMenuQuery));
  await client.fetchQuery(menusOptions("other", "base", initialMenuQuery));
  expect(request).toHaveBeenCalledTimes(2);
  expect(menusOptions("first", "base", initialMenuQuery).queryKey).not.toEqual(
    menusOptions("first", "platform-admin", initialMenuQuery).queryKey,
  );
  expect(menusOptions("first", "base", initialMenuQuery).queryKey).not.toEqual(
    menusOptions("first", "base", { ...initialMenuQuery, page: 2 }).queryKey,
  );
  expect(request.mock.calls[0]?.[2]).toMatchObject({
    signal: expect.any(AbortSignal),
    notify: false,
  });
  client.clear();
});
it("排序读取完整模块跨页目录，保存传递批量版本及冲突原错", async () => {
  request
    .mockResolvedValueOnce({ ...menuOverrideExamples.list, total: 2 })
    .mockResolvedValueOnce({ ...menuOverrideExamples.list, total: 2 });
  const signal = new AbortController().signal;
  expect(await allMenus("base", signal)).toHaveLength(2);
  expect(request.mock.calls[1]?.[0]).toContain("page=2");
  const context = { signal, idempotencyKey: "review" };
  request.mockResolvedValue([]);
  await saveMenus(menuOverrideExamples.update, context);
  expect(request.mock.calls[2]?.[2]).toMatchObject({
    method: "PATCH",
    body: menuOverrideExamples.update,
    ...context,
  });
  const conflict = new ApiError(409, 90002);
  request.mockRejectedValue(conflict);
  await expect(saveMenus(menuOverrideExamples.update, context)).rejects.toBe(
    conflict,
  );
  request.mockReset();
  expect(() => saveMenus({ items: [] }, context)).toThrow();
  expect(request).not.toHaveBeenCalled();
});

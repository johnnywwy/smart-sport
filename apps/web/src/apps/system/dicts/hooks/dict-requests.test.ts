import { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../../../shared/api/client", () => ({ apiClient: { request } }));

import { ApiError } from "../../../../shared/errors/api-error";
import { customDictItem, dictTypesExample } from "../__tests__/fixtures";
import { dictItemValues, initialDictQuery } from "../dict-state";
import {
  createDictItem,
  deleteDictItem,
  dictItemOptions,
  dictItemsOptions,
  dictTypesOptions,
  saveDictItem,
} from "./dict-requests";

beforeEach(() => {
  request.mockReset();
});
it("目录与列表请求按身份、字典和分页筛选隔离，携带取消信号", async () => {
  request.mockResolvedValue(dictTypesExample);
  const client = new QueryClient();
  await client.fetchQuery(dictTypesOptions("first"));
  await client.fetchQuery(dictTypesOptions("second"));
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[0]?.[2]).toMatchObject({
    notify: false,
    signal: expect.any(AbortSignal),
  });
  expect(
    dictItemsOptions("first", "stage", initialDictQuery).queryKey,
  ).not.toEqual(dictItemsOptions("second", "stage", initialDictQuery).queryKey);
  expect(
    dictItemsOptions("first", "stage", initialDictQuery).queryKey,
  ).not.toEqual(dictItemsOptions("first", "gender", initialDictQuery).queryKey);
  expect(
    dictItemsOptions("first", "stage", initialDictQuery).queryKey,
  ).not.toEqual(
    dictItemsOptions("first", "stage", { ...initialDictQuery, page: 2 })
      .queryKey,
  );
  request.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
  await client.fetchQuery(
    dictItemsOptions("first", "stage", {
      ...initialDictQuery,
      filters: { enabled: "false" },
    }),
  );
  expect(request.mock.lastCall?.[0]).toContain("enabled=false");
  client.clear();
});
it("新增、修改、删除传版本、布尔值、幂等键及取消信号，冲突不吞掉", async () => {
  const context = {
    idempotencyKey: crypto.randomUUID(),
    signal: new AbortController().signal,
  };
  const values = { ...dictItemValues(customDictItem), enabled: false };
  request.mockResolvedValue(customDictItem);
  await createDictItem("document_type", values, context);
  expect(request.mock.lastCall).toMatchObject([
    "/api/v1/dict-types/document_type/items",
    expect.anything(),
    { method: "POST", body: values, ...context },
  ]);
  await saveDictItem(customDictItem.id, { ...values, version: 4 }, context);
  expect(request.mock.lastCall?.[2]).toMatchObject({
    method: "PATCH",
    body: { ...values, version: 4 },
    ...context,
  });
  request.mockResolvedValue(null);
  await deleteDictItem(customDictItem.id, 5, context);
  expect(request.mock.lastCall?.[2]).toMatchObject({
    method: "DELETE",
    body: { version: 5 },
    ...context,
  });
  const conflict = new ApiError(409, 90002);
  request.mockRejectedValue(conflict);
  await expect(
    saveDictItem(customDictItem.id, { ...values, version: 4 }, context),
  ).rejects.toBe(conflict);
});
it("冲突重载跨页按ID查找，不受旧名称和页面筛选影响", async () => {
  const client = new QueryClient();
  request
    .mockResolvedValueOnce({
      items: Array.from({ length: 100 }, () => ({
        ...customDictItem,
        id: "other",
      })),
      total: 101,
      page: 1,
      pageSize: 100,
    })
    .mockResolvedValueOnce({
      items: [{ ...customDictItem, label: "已改名" }],
      total: 101,
      page: 2,
      pageSize: 100,
    });
  expect(
    (
      await client.fetchQuery(
        dictItemOptions("identity", "document_type", customDictItem.id),
      )
    ).label,
  ).toBe("已改名");
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[1]?.[0]).toContain("page=2");
  expect(request.mock.calls.every((c) => !c[0].includes("keyword"))).toBe(true);
  client.clear();
});
it("重载目标已删除时返回404并终止分页，非法写入请求在联网前拒绝", async () => {
  request.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
  const client = new QueryClient();
  await expect(
    client.fetchQuery(
      dictItemOptions("identity", "document_type", customDictItem.id),
    ),
  ).rejects.toMatchObject({ code: 90004 });
  expect(request).toHaveBeenCalledTimes(1);
  client.clear();
  request.mockClear();
  const context = {
    idempotencyKey: "key",
    signal: new AbortController().signal,
  };
  expect(() =>
    createDictItem(
      "document_type",
      { ...dictItemValues(), label: "" },
      context,
    ),
  ).toThrow();
  expect(() =>
    saveDictItem(
      customDictItem.id,
      { ...dictItemValues(customDictItem), version: -1 },
      context,
    ),
  ).toThrow();
  expect(request).not.toHaveBeenCalled();
});

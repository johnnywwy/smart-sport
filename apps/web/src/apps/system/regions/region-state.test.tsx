import { regionManagementRowSchema } from "@smart-sport/contracts";
import { QueryClient } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../../shared/api/client", () => ({ apiClient: { request } }));

import { ProvinceList } from "./components/province-list/ProvinceList";
import { RegionDetails } from "./components/region-details/RegionDetails";
import { regionPreviewOptions, regionsOptions } from "./hooks/use-regions";
import {
  bureauLabel,
  initialRegionQuery,
  regionLevelName,
  regionQueryString,
} from "./region-state";

const row = regionManagementRowSchema.parse({
  code: "330000",
  name: "浙江省",
  level: 1,
  parentCode: null,
  path: "330000",
  parentName: null,
  schoolCount: 0,
  bureaus: [],
  allowedActions: ["view"],
});
it("按上级编码分页和名称查询，只向后端提交已声明字段", () => {
  expect(
    Object.fromEntries(
      new URLSearchParams(
        regionQueryString(
          {
            ...initialRegionQuery,
            keyword: " 西湖%_ ",
            filters: { extra: "unused" },
            deleted: true,
          },
          "330100",
        ),
      ),
    ),
  ).toEqual({
    page: "1",
    pageSize: "20",
    parent: "330100",
    keyword: "西湖%_",
    sort: "name:asc",
  });
  expect(() =>
    regionQueryString({ ...initialRegionQuery, pageSize: 101 }),
  ).toThrow();
});
it("学校数和教育局不伪造，多个关联与停用状态明确显示", () => {
  expect(bureauLabel(row)).toBe("未关联");
  expect(regionLevelName(3)).toBe("区县");
  expect(
    bureauLabel({
      ...row,
      bureaus: [
        { name: "甲教育局", status: 0 },
        { name: "乙教育局", status: 1 },
      ],
    }),
  ).toBe("甲教育局（已停用）、乙教育局");
});
it("省份选择使用真实名称及选中态，技术码仅用于集合标识", () => {
  const html = renderToStaticMarkup(
    <ProvinceList items={[row]} selected={row.code} onSelect={() => {}} />,
  );
  expect(html).toContain("浙江省");
  expect(html).toContain('aria-selected="true"');
  expect(html.replace(/<[^>]*>/g, "")).not.toContain(row.code);
  expect(() =>
    renderToStaticMarkup(<RegionDetails row={row} onClose={() => {}} />),
  ).not.toThrow();
});
it("管理列表和预览缓存按身份隔离，请求可取消且失败不冒充空成功", async () => {
  request.mockResolvedValue({ items: [row], total: 1, page: 1, pageSize: 20 });
  const client = new QueryClient();
  await client.fetchQuery(
    regionsOptions("actor-a", initialRegionQuery, row.code),
  );
  await client.fetchQuery(
    regionsOptions("actor-b", initialRegionQuery, row.code),
  );
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[0]?.[2]).toMatchObject({
    notify: false,
    signal: expect.any(AbortSignal),
  });
  expect(regionPreviewOptions("actor-a").queryKey).not.toEqual(
    regionPreviewOptions("actor-b").queryKey,
  );
  const error = new Error("拒绝");
  request.mockRejectedValue(error);
  await expect(client.fetchQuery(regionPreviewOptions("actor-a"))).rejects.toBe(
    error,
  );
  client.clear();
});

import { scopeOptionSchema } from "@smart-sport/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScopePicker } from "./ScopePicker";
import {
  coveringRegion,
  scopeKey,
  scopeValues,
  selectionCounts,
  toggleScope,
} from "./scope-selection";
import type { ScopeCandidates } from "./types";

const province = scopeOptionSchema.parse({
  type: "region",
  value: "330000",
  name: "浙江省",
  available: true,
  parentValue: null,
});
const city = scopeOptionSchema.parse({
  type: "region",
  value: "330100",
  name: "杭州市",
  available: true,
  parentValue: "330000",
});
const county = scopeOptionSchema.parse({
  type: "region",
  value: "330106",
  name: "西湖区",
  available: true,
  parentValue: "330100",
});
const school = scopeOptionSchema.parse({
  type: "school",
  value: "019483c0-0000-7000-8000-000000000001",
  name: "测试学校",
  available: true,
  parentValue: "330106",
});
const school2 = scopeOptionSchema.parse({
  ...school,
  value: "019483c0-0000-7000-8000-000000000002",
  name: "另一学校",
});
const options = [province, city, county, school];
const noop = () => {};
const state = { loading: false, error: false, retry: noop };
const candidates: ScopeCandidates = {
  scopeKey: "test",
  allowedTypes: ["region", "school"],
  type: "region",
  onTypeChange: noop,
  regions: {
    branches: [{ ...state, loaded: true, parent: null, items: [province] }],
    expanded: new Set(),
    onExpandedChange: noop,
  },
  schools: {
    ...state,
    items: [school],
    total: 1,
    page: 1,
    pageSize: 20,
    keyword: "",
    onKeywordChange: noop,
    onPageChange: noop,
  },
};

describe("范围选择器", () => {
  it("跨页/搜索增减学校时保留不可见页的原选择，重复勾选不重复", () => {
    const selected = toggleScope([province, school], school2, true);
    expect(selected).toEqual([province, school, school2]);
    expect(toggleScope(selected, school2, true)).toHaveLength(3);
    expect(toggleScope(selected, school2, false)).toEqual([province, school]);
  });
  it("沿真实父级识别多级包含；不推测尚未返回的区划路径", () => {
    expect(coveringRegion(school, [province], options)).toEqual(province);
    expect(coveringRegion(county, [province], options)).toEqual(province);
    expect(coveringRegion(county, [province], [county])).toBeUndefined();
    expect(coveringRegion(province, [city], options)).toBeUndefined();
  });
  it("取消父级不丢失显式子级；失效父级不能覆盖后代", () => {
    expect(toggleScope([province, city], province, false)).toEqual([city]);
    expect(
      coveringRegion(city, [{ ...province, available: false }], options),
    ).toBeUndefined();
  });
  it("只读与失效项不能新增；可移除失效项且不改变输入数组", () => {
    const selected = [province];
    expect(toggleScope(selected, school, true, true)).toEqual(selected);
    expect(
      toggleScope(selected, { ...school, available: false }, true),
    ).toEqual(selected);
    const invalid = { ...school, available: false };
    expect(toggleScope([province, invalid], invalid, false)).toEqual(selected);
    expect(selected).toEqual([province]);
  });
  it("计数区分选择项和展开后的学校数，提交只保留契约值", () => {
    expect(selectionCounts([province, school, school])).toEqual({
      regions: 1,
      schools: 1,
      unavailable: 0,
    });
    expect(scopeValues([province, school])).toEqual([
      { type: "region", value: province.value },
      { type: "school", value: school.value },
    ]);
    expect(() => scopeValues([province, province])).toThrow();
    expect(scopeKey(province)).not.toBe(
      scopeKey({ ...province, type: "school" }),
    );
  });
  it("错误父级数据成环时终止而不死循环", () => {
    expect(
      coveringRegion(
        county,
        [],
        [{ ...city, parentValue: county.value }, county],
      ),
    ).toBeUndefined();
  });
  it("显示名称、失效通用提示和选择项计数，不把系统值展示给用户", () => {
    const html = renderToStaticMarkup(
      <ScopePicker
        candidates={candidates}
        value={[
          province,
          { ...school, available: false, name: "不应泄露的名称" },
        ]}
        onChange={noop}
      />,
    );
    expect(html).toContain("浙江省");
    expect(html).toContain("已失效的负责范围");
    expect(html).not.toContain("不应泄露的名称");
    expect(html).not.toContain(`>${province.value}<`);
    expect(html).not.toContain(`>${school.value}<`);
    expect(html).toContain("移除浙江省");
    expect(html).toContain("此处为选择项数量");
  });
  it("只读保留选择及查看控件，但没有移除入口；未开放类型不生成候选", () => {
    const html = renderToStaticMarkup(
      <ScopePicker
        candidates={{ ...candidates, allowedTypes: [] }}
        value={[province]}
        onChange={noop}
        disabled
      />,
    );
    expect(html).toContain("当前组织暂未开放范围选择");
    expect(html).toContain("浙江省");
    expect(html).not.toContain("移除浙江省");
  });
});

import {
  createDictItemSchema,
  updateDictItemSchema,
} from "@smart-sport/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  customDictItem,
  dictItemExample,
  dictTypesExample,
} from "./__tests__/fixtures";
import { DictItemList } from "./components/dict-item-list/DictItemList";
import { DictTypeList } from "./components/dict-type-list/DictTypeList";
import {
  dictItemValues,
  dictQueryString,
  initialDictQuery,
  orderDictTypes,
  selectedDictType,
} from "./dict-state";

it("默认选择学段且优先展示，切换后保留明确选项，目录变化退回有效类型", () => {
  expect(selectedDictType(dictTypesExample, undefined)?.code).toBe("stage");
  expect(selectedDictType(dictTypesExample, "document_type")?.code).toBe(
    "document_type",
  );
  expect(selectedDictType(dictTypesExample, "ethnicity")?.code).toBe("stage");
  expect(selectedDictType([], undefined)).toBeUndefined();
  expect(orderDictTypes(dictTypesExample).map((t) => t.code)).toEqual([
    "stage",
    "gender",
    "document_type",
  ]);
  expect(dictTypesExample[0]?.code).toBe("gender");
});
it("查询正确编码中文和特殊字符、false筛选，排序限定共享契约字段", () => {
  const query = new URLSearchParams(
    dictQueryString({
      ...initialDictQuery,
      keyword: " 港澳%_ ",
      filters: { enabled: "false" },
      page: 2,
      pageSize: 50,
      sort: { column: "label", direction: "descending" },
    }),
  );
  expect(Object.fromEntries(query)).toEqual({
    page: "2",
    pageSize: "50",
    keyword: "港澳%_",
    enabled: "false",
    sort: "label:desc",
  });
  expect(
    new URLSearchParams(
      dictQueryString({
        ...initialDictQuery,
        filters: { enabled: "invalid" },
        sort: { column: "unknown", direction: "ascending" },
      }),
    ).get("sort"),
  ).toBe("sort:asc");
  expect(() =>
    dictQueryString({ ...initialDictQuery, pageSize: 101 }),
  ).toThrow();
});
it("表单只保留可编辑字段，不提交系统值和来源，false不会丢失", () => {
  expect(createDictItemSchema.safeParse(dictItemValues()).success).toBe(false);
  expect(
    createDictItemSchema.parse({ ...dictItemValues(), label: "新选项" }),
  ).toMatchObject({ enabled: true, sort: 0 });
});
it("已有选项的值转换剔除技术和授权字段，并保留停用布尔值", () => {
  const values = dictItemValues({ ...customDictItem, enabled: false });
  expect(updateDictItemSchema.parse({ ...values, version: 3 })).toEqual({
    label: customDictItem.label,
    description: "",
    sort: 1,
    enabled: false,
    version: 3,
  });
  expect(values).not.toHaveProperty("value");
  expect(values).not.toHaveProperty("allowedActions");
});
const render = (rows: (typeof dictItemExample)[], type = dictTypesExample[2]) =>
  renderToStaticMarkup(
    <DictItemList
      identityId="identity"
      status={{}}
      type={type}
      sidebar={<span>分类</span>}
      data={{ items: rows, total: rows.length, page: 1, pageSize: 20 }}
      query={initialDictQuery}
      onQueryChange={() => {}}
      actions={{
        create: () => {},
        view: () => {},
        edit: () => {},
        remove: () => {},
      }}
    />,
  );
it("内置行仅查看，自定义行写入口按 allowedActions 显示，不渲染技术值", () => {
  const builtin = render([dictItemExample]);
  expect(builtin).toContain("查看");
  expect(builtin).not.toContain(">编辑<");
  expect(builtin).not.toContain(">删除<");
  expect(builtin).not.toContain("resident_id");
  const custom = render([customDictItem]);
  expect(custom).toContain("编辑");
  expect(custom).toContain("删除");
  expect(custom).not.toContain("custom_example");
  const used = render([
    { ...customDictItem, used: true, allowedActions: ["update"] },
  ]);
  expect(used).toContain("编辑");
  expect(used).not.toContain(">删除<");
});
it("新增入口同时遵守类型可扩展及后端新增能力，只读分类支持键盘选择", () => {
  expect(render([], dictTypesExample[1])).not.toContain("新增选项");
  expect(render([], dictTypesExample[2])).toContain("新增选项");
  const extensible = dictTypesExample[2];
  if (!extensible) throw new Error("缺少证件类型");
  expect(render([], { ...extensible, allowedActions: [] })).not.toContain(
    "新增选项",
  );
  const sidebar = renderToStaticMarkup(
    <DictTypeList
      types={dictTypesExample}
      selected="stage"
      onSelect={() => {}}
    />,
  );
  expect(sidebar).toContain('role="listbox"');
  expect(sidebar).toContain('aria-selected="true"');
});

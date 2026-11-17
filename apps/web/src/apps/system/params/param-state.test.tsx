import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TableRowActions } from "../../../shared/components/data-table/components/table-row-actions/TableRowActions";
import { paramRows } from "./__tests__/fixtures";
import { ParamList } from "./components/param-list/ParamList";
import {
  initialParamQuery,
  paramDescription,
  paramFormSchema,
  paramQueryString,
  paramUpdatedAt,
  paramValueLabel,
  paramValues,
} from "./param-state";

it("请求按共享契约编码关键字分页及排序，不向后端发送无关筛选", () => {
  expect(
    Object.fromEntries(
      new URLSearchParams(
        paramQueryString({
          ...initialParamQuery,
          keyword: " 密码%_ ",
          page: 2,
          pageSize: 50,
          sort: { column: "updatedAt", direction: "descending" },
          filters: { unused: "x" },
          deleted: true,
        }),
      ),
    ),
  ).toEqual({
    page: "2",
    pageSize: "50",
    keyword: "密码%_",
    sort: "updatedAt:desc",
  });
  expect(
    new URLSearchParams(
      paramQueryString({
        ...initialParamQuery,
        sort: { column: "value", direction: "ascending" },
      }),
    ).get("sort"),
  ).toBe("name:asc");
  expect(() =>
    paramQueryString({ ...initialParamQuery, pageSize: 101 }),
  ).toThrow();
});
it("各参数表单使用共享按键校验，零值只用于支持关闭的参数，原因必填", () => {
  for (const row of paramRows) {
    const schema = paramFormSchema(row),
      base = { ...paramValues(row), reason: "调整原因", version: 4 };
    expect(schema.parse(base)).toEqual({
      value: row.value,
      reason: "调整原因",
      version: 4,
    });
    for (const value of [row.min - 1, row.max + 1, 1.5, "8", null, ""])
      expect(schema.safeParse({ ...base, value }).success).toBe(false);
    expect(schema.safeParse({ ...base, value: row.min }).success).toBe(true);
    expect(schema.safeParse({ ...base, value: row.max }).success).toBe(true);
    expect(schema.safeParse({ ...base, reason: " " }).success).toBe(false);
    expect(
      schema.safeParse({ ...base, reason: "字".repeat(501) }).success,
    ).toBe(false);
    expect(paramValues(row)).toEqual({ value: row.value, reason: "" });
  }
});
it("展示单位、关闭含义与上海时间，不把任务编号当产品文案", () => {
  for (const row of paramRows) {
    const label = paramValueLabel(row);
    if (row.key === "password.expire_days") expect(label).toBe("不限");
    else expect(label).toContain(row.unit);
    expect(paramDescription(row)).not.toContain("T-022");
  }
  const grace = paramRows.find((r) => r.key === "subscription.grace_days");
  if (!grace) throw new Error("缺少宽限期");
  expect(paramValueLabel({ ...grace, value: 0 })).toBe("无宽限期");
  expect(paramUpdatedAt("2026-11-16T18:01:00Z")).toBe("2026-11-17 02:01");
});
it("修改入口遵守行能力，只读行无按钮；列表没有创建删除或技术编码", () => {
  const row = paramRows[0];
  if (!row) throw new Error("缺少参数");
  const actions = (allowedActions: string[]) =>
    renderToStaticMarkup(
      <TableRowActions
        item={{ ...row, allowedActions }}
        disabled={false}
        actions={[{ action: "update", label: "修改", onPress: () => {} }]}
      />,
    );
  expect(actions(["update"])).toContain("修改");
  expect(actions([])).not.toContain("修改");
  const html = renderToStaticMarkup(
    <ParamList
      identityId="actor"
      data={{ items: paramRows, total: 8, page: 1, pageSize: 20 }}
      query={initialParamQuery}
      onQueryChange={() => {}}
      status={{}}
      onEdit={() => {}}
    />,
  );
  const visibleText = html.replace(/<[^>]*>/g, "");
  for (const key of ["password.min_length", row.id, "新增参数", "删除"])
    expect(visibleText).not.toContain(key);
  for (const label of ["系统参数", "当前值", "说明", "最近修改"])
    expect(html).toContain(label);
});

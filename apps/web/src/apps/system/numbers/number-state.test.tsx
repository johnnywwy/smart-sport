import {
  numberRuleSchema,
  updateNumberRuleSchema,
} from "@smart-sport/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TableRowActions } from "../../../shared/components/data-table/components/table-row-actions/TableRowActions";
import { numberRuleExample } from "./__tests__/fixtures";
import {
  initialNumberQuery,
  numberRuleValues,
  numberTablePage,
} from "./number-state";

const transfer = numberRuleSchema.parse({
  ...numberRuleExample,
  id: "019a87ce-7000-7000-8000-000000000002",
  type: "transfer",
  name: "转学申请",
  prefix: "ZX",
  nextNumber: null,
  allowedActions: [],
});
it("对象、关键字和分页同时生效，空预览可搜索，越界页回到有效页", () => {
  const rows = [numberRuleExample, transfer];
  const filtered = numberTablePage(rows, {
    ...initialNumberQuery,
    keyword: " zx ",
    filters: { object: "transfer" },
    page: 99,
  });
  expect(filtered.items).toEqual([transfer]);
  expect(filtered.page).toBe(1);
  expect(filtered.total).toBe(1);
  expect(
    numberTablePage(rows, {
      ...initialNumberQuery,
      keyword: "000045",
    }).items,
  ).toEqual([numberRuleExample]);
  expect(numberTablePage([], initialNumberQuery)).toMatchObject({
    items: [],
    total: 0,
    page: 1,
  });
});
it("排序和分页不会修改服务端缓存，也不会扩大发回的行操作能力", () => {
  const rows = [transfer, numberRuleExample];
  const result = numberTablePage(rows, {
    ...initialNumberQuery,
    pageSize: 1,
    sort: { column: "name", direction: "ascending" },
  });
  expect(result.items[0]?.name).toBe("开通申请");
  expect(rows[0]).toBe(transfer);
  expect(
    numberTablePage(rows, {
      ...initialNumberQuery,
      filters: { object: "transfer" },
    }).items[0]?.allowedActions,
  ).toEqual([]);
});
it("配置表单只提交可编辑配置和版本，不携带流水、对象或预览", () => {
  expect(
    updateNumberRuleSchema.parse({
      ...numberRuleValues(numberRuleExample),
      version: 3,
    }),
  ).toEqual({ prefix: "KT", digits: 6, reset: "yearly", version: 3 });
});
it("修改入口按每行 allowedActions 显示，未授予修改权限时没有按钮", () => {
  const markup = (row: typeof numberRuleExample) =>
    renderToStaticMarkup(
      <TableRowActions
        item={row}
        disabled={false}
        actions={[{ action: "update", label: "修改", onPress: () => {} }]}
      />,
    );
  expect(markup(numberRuleExample)).toContain("修改");
  expect(markup(transfer)).not.toContain("修改");
});

import { describe, expect, it } from "vitest";
import {
  changeTableQuery,
  selectedDeletableRows,
  tablePageNumbers,
  tableSortParameter,
  visibleTableColumns,
} from "./table-state";
import type { TableQuery } from "./types";

const query: TableQuery = {
  page: 4,
  pageSize: 20,
  keyword: "学校",
  filters: { status: "active" },
  deleted: false,
};
describe("通用列表查询与权限边界", () => {
  it("搜索、筛选、排序、切换回收站和每页条数改变时回到第一页", () => {
    for (const patch of [
      { keyword: "新学校" },
      { filters: { status: "disabled" } },
      { sort: { column: "name", direction: "ascending" as const } },
      { deleted: true },
      { pageSize: 50 },
    ]) {
      expect(changeTableQuery(query, patch)).toMatchObject({
        ...patch,
        page: 1,
      });
    }
    expect(query.page).toBe(4);
  });
  it("翻页保留已提交的查询条件", () => {
    expect(changeTableQuery(query, { page: 5 })).toEqual({
      ...query,
      page: 5,
    });
  });
  it("排序转换为公共接口约定，未排序时不发送", () => {
    expect(tableSortParameter({ column: "name", direction: "ascending" })).toBe(
      "name:asc",
    );
    expect(
      tableSortParameter({ column: "createdAt", direction: "descending" }),
    ).toBe("createdAt:desc");
    expect(tableSortParameter(undefined)).toBeUndefined();
  });
  it("批量删除只保留当前页勾选且仍有删除权限的记录", () => {
    const rows = [
      { id: "can-delete", allowedActions: ["view", "delete"] },
      { id: "view-only", allowedActions: ["view"] },
      { id: "not-selected", allowedActions: ["delete"] },
    ];
    expect(
      selectedDeletableRows(
        rows,
        new Set(["can-delete", "view-only", "previous-page"]),
      ),
    ).toEqual([rows[0]]);
    expect(
      selectedDeletableRows(
        [{ id: "can-delete", allowedActions: ["view"] }],
        new Set(["can-delete"]),
      ),
    ).toEqual([]);
  });
  it("首列与必需列不会被列设置隐藏", () => {
    const columns = [
      { id: "name", label: "姓名", render: () => "" },
      { id: "status", label: "状态", render: () => "", required: true },
      { id: "department", label: "部门", render: () => "" },
    ];
    expect(visibleTableColumns(columns, new Set()).map((c) => c.id)).toEqual([
      "name",
      "status",
    ]);
  });
  it("大量页码只生成当前页附近的有限按钮", () => {
    expect(tablePageNumbers(1, 100)).toEqual([1, 2, 3, 4, 5]);
    expect(tablePageNumbers(50, 100)).toEqual([48, 49, 50, 51, 52]);
    expect(tablePageNumbers(100, 100)).toEqual([96, 97, 98, 99, 100]);
    expect(tablePageNumbers(1, 1)).toEqual([1]);
  });
});

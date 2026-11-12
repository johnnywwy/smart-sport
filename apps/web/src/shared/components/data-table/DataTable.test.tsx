import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TableRowActions } from "./components/table-row-actions/TableRowActions";
import { DataTable } from "./DataTable";
import type { DataTableProps, TableRecord } from "./types";

const props: DataTableProps<TableRecord & { name: string }> = {
  scopeKey: "identity:school",
  config: {
    title: "成员账号",
    permissions: ["org:member:view"],
    columns: [{ id: "name", label: "姓名", render: (item) => item.name }],
    rowLabel: (item) => item.name,
    actions: [
      {
        id: "create",
        label: "新增成员",
        permission: "org:member:create",
        onPress: () => {},
      },
      {
        id: "export",
        label: "导出",
        permission: "org:member:export",
        onPress: () => {},
      },
    ],
    recycleBin: true,
    batchDelete: {
      permission: "org:member:delete",
      onPress: () => {},
    },
  },
  data: { items: [], page: 1, pageSize: 20, total: 0 },
  query: {
    page: 1,
    pageSize: 20,
    keyword: "",
    filters: {},
    deleted: false,
  },
  onQueryChange: () => {},
};
describe("通用列表渲染", () => {
  it("只读权限不显示新增、导出和批量删除", () => {
    const markup = renderToStaticMarkup(<DataTable {...props} />);
    expect(markup).not.toContain("新增成员");
    expect(markup).not.toContain(">导出<");
    expect(markup).not.toContain("批量删除");
    expect(markup).toContain("回收站");
    expect(markup).toContain("暂无数据");
  });
  it("按具体权限显示顶部操作", () => {
    const markup = renderToStaticMarkup(
      <DataTable
        {...props}
        config={{
          ...props.config,
          permissions: ["org:member:create", "org:member:delete"],
        }}
      />,
    );
    expect(markup).toContain("新增成员");
    expect(markup).toContain("选择本页可删除记录");
    expect(markup).not.toContain(">导出<");
  });
  it("行操作只显示该行 allowedActions 授予的动作", () => {
    const markup = renderToStaticMarkup(
      <TableRowActions
        item={{ id: "row", allowedActions: ["view"] }}
        disabled={false}
        actions={[
          { action: "view", label: "查看", onPress: () => {} },
          { action: "update", label: "编辑", onPress: () => {} },
          { action: "delete", label: "删除", onPress: () => {} },
        ]}
      />,
    );
    expect(markup).toContain("查看");
    expect(markup).not.toContain("编辑");
    expect(markup).not.toContain("删除");
  });
  it("回收站不显示新增或批量删除，恢复由行权限控制", () => {
    const markup = renderToStaticMarkup(
      <DataTable
        {...props}
        query={{ ...props.query, deleted: true }}
        config={{
          ...props.config,
          permissions: ["org:member:create", "org:member:delete"],
        }}
      />,
    );
    expect(markup).not.toContain("新增成员");
    expect(markup).not.toContain("批量删除");
    expect(markup).toContain("已删除的记录");
  });
  it("加载与错误状态不误显示为空列表", () => {
    const loading = renderToStaticMarkup(
      <DataTable {...props} status={{ loading: true }} />,
    );
    expect(loading).toContain("正在加载");
    expect(loading).not.toContain("暂无数据");
    const error = renderToStaticMarkup(
      <DataTable {...props} status={{ error: true, onRetry: () => {} }} />,
    );
    expect(error).toContain("加载失败");
    expect(error).toContain("重新加载");
    expect(error).not.toContain("暂无数据");
  });
  it("加载或失败时隐藏旧数据，避免继续操作过期记录", () => {
    for (const status of [{ loading: true }, { error: true }]) {
      const markup = renderToStaticMarkup(
        <DataTable
          {...props}
          data={{
            ...props.data,
            items: [{ id: "old-row", name: "过期记录", allowedActions: [] }],
          }}
          status={status}
        />,
      );
      expect(markup).not.toContain("过期记录");
    }
  });
  it("恢复操作同样按行授权，未授权的记录不显示恢复按钮", () => {
    for (const allowedActions of [[], ["restore"]]) {
      const markup = renderToStaticMarkup(
        <TableRowActions
          item={{ id: "deleted-row", allowedActions }}
          actions={[{ action: "restore", label: "恢复", onPress: () => {} }]}
          disabled={false}
        />,
      );
      expect(markup.includes("恢复")).toBe(allowedActions.includes("restore"));
    }
  });
});

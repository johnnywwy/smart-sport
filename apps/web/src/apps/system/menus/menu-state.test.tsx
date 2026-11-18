import { menuOverrideExamples } from "@smart-sport/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TableRowActions } from "../../../shared/components/data-table/components/table-row-actions/TableRowActions";
import { MenuList } from "./components/menu-list/MenuList";
import {
  initialMenuQuery,
  menuQueryString,
  reorderedMenus,
} from "./menu-state";

const a = menuOverrideExamples.list.items[0];
if (!a) throw new Error("缺少菜单示例");
const b = {
  ...a,
  id: "base:members",
  key: "members",
  sort: 20,
  displayName: "成员账号",
  version: 4,
};
const other = {
  ...a,
  id: "base:schools",
  key: "schools",
  groupKey: "school",
  sort: 10,
};
it("拖动排序仅调整本分组，保留版本和名称，相同顺序也能重排，原位无写入", () => {
  const result = reorderedMenus([a, b, other], b, a, "before");
  expect(result.map((row) => [row.key, row.sort, row.version])).toEqual([
    ["members", 10, 4],
    ["departments", 20, 1],
  ]);
  expect(result[0]?.displayName).toBe("成员账号");
  expect(reorderedMenus([a, b], a, b, "before")).toEqual([]);
  expect(reorderedMenus([a, b, other], a, other, "before")).toEqual([]);
  expect(reorderedMenus([a, b], a, a, "after")).toEqual([]);
  expect(
    reorderedMenus([a, { ...b, sort: a.sort }], a, b, "after").map(
      (row) => row.key,
    ),
  ).toEqual(["members", "departments"]);
});
it("查询不使用技术编码或任意排序，切分页和关键字与模块对应", () => {
  const query = new URLSearchParams(
    menuQueryString("platform-admin", {
      ...initialMenuQuery,
      page: 2,
      keyword: "  菜单  ",
    }),
  );
  expect(Object.fromEntries(query)).toEqual({
    module: "platform-admin",
    page: "2",
    pageSize: "20",
    keyword: "菜单",
  });
});
it("只读行没有改名入口", () => {
  const render = (allowedActions: string[]) =>
    renderToStaticMarkup(
      <TableRowActions
        item={{ ...a, allowedActions }}
        disabled={false}
        actions={[{ action: "update", label: "改名", onPress: () => {} }]}
      />,
    );
  expect(render([])).not.toContain("改名");
  expect(render(["update"])).toContain("改名");
});

it("菜单列表只读没有拖动入口，写身份显示手柄且不再提供上下移按钮", () => {
  const render = (allowedActions: "update"[]) =>
    renderToStaticMarkup(
      <MenuList
        identityId="actor"
        module="base"
        sidebar={null}
        data={{
          items: [{ ...a, allowedActions }],
          total: 1,
          page: 1,
          pageSize: 20,
        }}
        query={initialMenuQuery}
        onQueryChange={() => {}}
        status={{}}
        actions={{ busy: false, edit: () => {}, move: () => {} }}
      />,
    );
  expect(render([])).not.toContain("拖动排序组织架构");
  const html = render(["update"]);
  expect(html).toContain("拖动排序组织架构");
  expect(html).not.toContain("上移");
  expect(html).not.toContain("下移");
});

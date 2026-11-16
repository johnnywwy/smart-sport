import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SchoolOptions } from "./SchoolOptions";

const base = {
  data: undefined,
  query: { keyword: "", page: 1 },
  onQueryChange: () => {},
  onSelect: () => {},
  status: { loading: false, error: false, retry: () => {} },
};
it("未选择学校时真实展示空候选，加载和失败不误报为空", () => {
  expect(renderToStaticMarkup(<SchoolOptions {...base} />)).toContain(
    "暂无可选学校",
  );
  const loading = renderToStaticMarkup(
    <SchoolOptions {...base} status={{ ...base.status, loading: true }} />,
  );
  expect(loading).toContain("正在加载学校");
  expect(loading).not.toContain("暂无可选学校");
  const error = renderToStaticMarkup(
    <SchoolOptions {...base} status={{ ...base.status, error: true }} />,
  );
  expect(error).toContain("重新加载");
  expect(error).not.toContain("暂无可选学校");
});
it("候选只列有查看能力的学校，显示名称和地区，不暴露技术ID", () => {
  const data = {
    page: 1,
    pageSize: 20,
    total: 2,
    items: [
      {
        id: "private-school-id",
        name: "可选学校",
        regionName: "杭州市",
        allowedActions: ["view" as const],
      },
      {
        id: "hidden-school-id",
        name: "不允许选择的学校",
        regionName: "北京市",
        allowedActions: [],
      },
    ],
  };
  const html = renderToStaticMarkup(<SchoolOptions {...base} data={data} />);
  expect(html).toContain("可选学校");
  expect(html).toContain("杭州市");
  expect(html).not.toContain("不允许选择的学校");
  expect(html).not.toContain("private-school-id");
});

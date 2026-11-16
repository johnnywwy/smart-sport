import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { initialSchoolQuery } from "../../../../../shared/hooks/school-navigation";
import { SchoolList } from "./SchoolList";

it("学校列表复用统一搜索分页，教育局没有进入校内业务按钮", () => {
  const markup = renderToStaticMarkup(
    <SchoolList
      identityId="identity"
      data={undefined}
      query={initialSchoolQuery()}
      onQueryChange={() => {}}
      status={{ loading: false, error: false, onRetry: () => {} }}
      enter={{ enabled: false, busy: false, onSelect: () => {} }}
    />,
  );
  expect(markup).toContain("学校名称");
  expect(markup).toContain("所在地区");
  expect(markup).toContain("搜索学校名称");
  expect(markup).toContain("共 0 条");
  expect(markup).not.toContain('id="$actions"');
  expect(markup).not.toContain("编辑档案");
  expect(markup).not.toContain('role="columnheader">操作');
});

it("公司档案操作列在请求完成前已存在，数据返回后无需重新挂载表格", () => {
  const markup = renderToStaticMarkup(
    <SchoolList
      identityId="identity"
      data={undefined}
      query={initialSchoolQuery()}
      onQueryChange={() => {}}
      status={{ loading: true, error: false, onRetry: () => {} }}
      enter={{ enabled: false, busy: false, onSelect: () => {} }}
      profile={{ enabled: true, allowedIds: new Set(), onSelect: () => {} }}
    />,
  );
  expect(markup).toContain("操作");
});

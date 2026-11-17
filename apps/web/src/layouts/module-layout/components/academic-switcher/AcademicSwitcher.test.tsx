import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { academicYearExample } from "../../../../shared/testing/academic-fixtures";
import { AcademicPeriodList } from "../academic-period-list/AcademicPeriodList";
import { AcademicSwitcher } from "./AcademicSwitcher";

it("加载、失败和空日历触发器分别显示真实状态，不使用静态示例学期", () => {
  const render = (loading: boolean, error: boolean) =>
    renderToStaticMarkup(
      <AcademicSwitcher
        years={[]}
        selection={null}
        status={{ loading, error, retry: () => {} }}
        onSelect={() => {}}
      />,
    );
  expect(render(true, false)).toContain("正在加载学期");
  expect(render(false, true)).toContain("学期加载失败");
  expect(render(false, false)).toContain("暂无学年学期");
  expect(render(false, false)).not.toContain("2026-2027");
});
it("学期列表按学年分组，完整名称供辅助阅读，当前标记与选中项独立", () => {
  const markup = renderToStaticMarkup(
    <AcademicPeriodList
      years={[academicYearExample]}
      selectedId={academicYearExample.semesters[1].id}
      onSelect={() => {}}
    />,
  );
  expect(markup).toContain("2026-2027学年");
  expect(markup).toContain("第一学期");
  expect(markup).toContain("第二学期");
  expect(markup).toContain("当前");
  expect(markup).toContain('aria-selected="true"');
  expect(markup).not.toContain("设为当前");
  expect(markup).not.toContain("编辑");
});

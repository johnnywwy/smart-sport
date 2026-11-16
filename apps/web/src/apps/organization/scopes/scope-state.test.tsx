import { scopeOptionSchema } from "@smart-sport/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiError } from "../../../shared/errors/api-error";
import { ScopeOverview } from "./components/scope-overview/ScopeOverview";
import { ScopePreview } from "./components/scope-preview/ScopePreview";
import { scopeFormSchema, scopeTargetKey } from "./scope-state";

const id = "019483c0-0000-7000-8000-000000000001";
const region = scopeOptionSchema.parse({
  type: "region",
  value: "330000",
  name: "浙江省",
  available: true,
  parentValue: null,
});
describe("负责范围业务状态", () => {
  it("提交剥离名称等展示字段，保留0版本并沿用契约拒绝重复范围", () => {
    expect(scopeFormSchema.safeParse({ version: 0, scopes: [region] })).toEqual(
      {
        success: true,
        data: { version: 0, scopes: [{ type: "region", value: "330000" }] },
      },
    );
    expect(
      scopeFormSchema.safeParse({ version: 0, scopes: [region, region] })
        .success,
    ).toBe(false);
    expect(scopeFormSchema.safeParse({ version: -1, scopes: [] }).success).toBe(
      false,
    );
  });
  it("缓存按操作身份、目标类型和目标ID隔离", () => {
    const base = { kind: "department" as const, id, name: "部门" };
    const key = scopeTargetKey("actor", base);
    expect(key).not.toEqual(scopeTargetKey("other", base));
    expect(key).not.toEqual(
      scopeTargetKey("actor", { ...base, kind: "identity" }),
    );
    expect(key).not.toEqual(scopeTargetKey("actor", { ...base, id: "other" }));
  });
  it("只读概览不显示编辑入口，显示失效名称和真实0数量", () => {
    const html = renderToStaticMarkup(
      <ScopeOverview
        title="部门负责范围"
        scopes={[{ ...region, name: "已失效的负责范围", available: false }]}
        schoolCount={0}
        editable={false}
        onEdit={() => {}}
      />,
    );
    expect(html).toContain("已失效的负责范围");
    expect(html).not.toContain("编辑范围");
    expect(html).toContain("覆盖 0 所启用学校");
    expect(html).not.toContain(id);
  });
  it("草稿等待、失效或无预览权限时不显示旧的学校数量", () => {
    const base = {
      data: {
        schoolCount: 999,
        supported: true,
        dataScope: null,
        warnings: [],
        steps: [],
      },
      loading: false,
      waiting: false,
      unavailable: false,
      error: null,
      onRetry: () => {},
    };
    for (const props of [
      { waiting: true },
      { unavailable: true },
      { error: new ApiError(403, 11101) },
    ]) {
      const html = renderToStaticMarkup(<ScopePreview {...base} {...props} />);
      expect(html).not.toContain("999");
    }
  });
});

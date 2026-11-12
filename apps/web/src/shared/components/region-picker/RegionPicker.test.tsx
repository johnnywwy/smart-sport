import { regionListSchema } from "@smart-sport/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RegionPicker } from "./RegionPicker";

const regions = regionListSchema.parse([
  {
    code: "330000",
    name: "浙江省",
    level: 1,
    parentCode: null,
    path: "330000",
  },
  {
    code: "330100",
    name: "杭州市",
    level: 2,
    parentCode: "330000",
    path: "330000.330100",
  },
  {
    code: "330106",
    name: "西湖区",
    level: 3,
    parentCode: "330100",
    path: "330000.330100.330106",
  },
]);
const base = {
  regions,
  loadedParents: new Set(["root", "330000", "330100"]),
  expandedCodes: ["330000", "330100"],
  onExpandedChange: () => {},
  onChange: () => {},
  loading: false,
  error: false,
  onRetry: () => {},
};
describe("行政区划树选择", () => {
  it("显示实际路径名称，不能把区划编码展示给用户", () => {
    const html = renderToStaticMarkup(
      <RegionPicker {...base} value="330106" />,
    );
    expect(html).toContain("浙江省 / 杭州市 / 西湖区");
    expect(html).not.toContain(">330106<");
    expect(html).toContain('aria-label="所属地区"');
  });
  it("允许选择省、市层级，未加载时使用已有名称", () => {
    expect(
      renderToStaticMarkup(<RegionPicker {...base} value="330000" />),
    ).toContain(">浙江省<");
    expect(
      renderToStaticMarkup(
        <RegionPicker
          {...base}
          regions={[]}
          value="330106"
          selectedLabel="浙江省 / 杭州市 / 西湖区"
        />,
      ),
    ).toContain("浙江省 / 杭州市 / 西湖区");
  });
  it("禁用与字段错误状态传到 HeroUI 控件", () => {
    const html = renderToStaticMarkup(
      <RegionPicker
        {...base}
        value={null}
        disabled
        invalid
        errorId="region-error"
      />,
    );
    expect(html).toContain('data-invalid="true"');
    expect(html).toContain('aria-describedby="region-error"');
    expect(html).toContain("disabled");
    expect(html).toContain("请选择省 / 市 / 区县");
  });
});

import { createDictItemSchema } from "@smart-sport/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { validateForm } from "../../form-state";
import type { FormField as Field } from "../../types";
import { FormField } from "./FormField";

const field: Field = {
  name: "enabled",
  label: "状态",
  type: "select",
  options: [
    { value: true, label: "启用" },
    { value: false, label: "停用" },
  ],
};
it("布尔选项保留 false 类型，校验提交不转换为字符串或空值", () => {
  expect(
    validateForm(
      createDictItemSchema,
      { label: "测试", description: "", sort: 1, enabled: false },
      [field],
    ),
  ).toMatchObject({ success: true, data: { enabled: false } });
  const markup = renderToStaticMarkup(
    <FormField
      field={{ ...field, readOnly: true }}
      value={false}
      disabled={false}
      showRequired={false}
      onChange={() => {}}
    />,
  );
  expect(markup).toContain('value="停用"');
  expect(markup).not.toContain('value="未设置"');
});

import {
  loginRequestSchema,
  updateNumberRuleSchema,
  updateOrganizationRequestSchema,
} from "@smart-sport/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SchemaForm } from "./SchemaForm";

describe("通用表单展示", () => {
  it("reset 等契约字段不覆盖原生表单方法，业务状态仍使用契约键", () => {
    const html = renderToStaticMarkup(
      <SchemaForm
        schema={updateNumberRuleSchema}
        initialValues={{ prefix: "ZX", digits: 6, reset: "yearly" }}
        version={0}
        fields={[
          {
            name: "reset",
            label: "重置周期",
            type: "select",
            options: [{ value: "yearly", label: "每年" }],
          },
        ]}
        submitLabel="保存"
        onSubmit={async () => {}}
      >
        {({ values }) => <span>{String(values.reset)}</span>}
      </SchemaForm>,
    );
    expect(html).not.toContain('name="reset"');
    expect(html).toContain('name="field-reset"');
    expect(html).toContain("yearly");
  });
  it("只读字段显示原因，version 随提交携带但不显示系统字段", () => {
    const html = renderToStaticMarkup(
      <SchemaForm
        schema={updateOrganizationRequestSchema}
        initialValues={{ name: "示例机构", regionCode: null }}
        version={0}
        fields={[
          {
            name: "name",
            label: "机构名称",
            readOnly: true,
            readOnlyReason: "机构名称由平台维护",
          },
        ]}
        submitLabel="保存"
        onSubmit={async () => {}}
        rule="保存后立即生效"
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("示例机构");
    expect(html).toContain("机构名称由平台维护");
    expect(html).toContain("readOnly");
    expect(html).toContain("保存后立即生效");
    expect(html).toContain("取消");
    expect(html).not.toContain('name="version"');
  });
  it("保留认证表单样式及输入后清除字段错误的结构", () => {
    const html = renderToStaticMarkup(
      <SchemaForm
        appearance="auth"
        schema={loginRequestSchema}
        fields={[
          { name: "account", label: "账号" },
          { name: "password", label: "密码", type: "password" },
        ]}
        errors={{ account: ["请输入账号"] }}
        submitLabel="登录"
        onSubmit={async () => {}}
      />,
    );
    expect(html).toContain("auth-submit");
    expect(html).toContain("请输入账号");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('type="password"');
  });
  it("未映射的服务端字段错误仍显示给用户，避免无反馈", () => {
    const html = renderToStaticMarkup(
      <SchemaForm
        schema={loginRequestSchema}
        fields={[]}
        errors={{ "items.0.name": ["名称重复"] }}
        submitLabel="保存"
        onSubmit={async () => {}}
      />,
    );
    expect(html).toContain("名称重复");
    expect(html).toContain('role="alert"');
  });
  it("支持复杂控件读取表单状态，仍由统一契约校验", () => {
    const html = renderToStaticMarkup(
      <SchemaForm
        schema={updateOrganizationRequestSchema}
        initialValues={{ name: "复杂字段初值" }}
        fields={[]}
        submitLabel="保存"
        onSubmit={async () => {}}
      >
        {({ values, disabled }) => (
          <p>
            {String(values.name)}
            {disabled ? "保存中" : "可编辑"}
          </p>
        )}
      </SchemaForm>,
    );
    expect(html).toContain("复杂字段初值");
    expect(html).toContain("可编辑");
  });
});

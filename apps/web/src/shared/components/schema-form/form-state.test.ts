import {
  createOrganizationRequestSchema,
  loginRequestSchema,
  toggleOrganizationRequestSchema,
  updateOrganizationRequestSchema,
} from "@smart-sport/contracts";
import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/api-error";
import { formFailure, initialFormValues, validateForm } from "./form-state";

describe("契约驱动的业务表单", () => {
  it("使用现有新增契约执行 trim 和校验，不另写业务规则", () => {
    expect(
      validateForm(
        createOrganizationRequestSchema,
        { name: "  测试代理商  ", type: "agent" },
        [],
      ),
    ).toEqual({ success: true, data: { name: "测试代理商", type: "agent" } });
    expect(
      validateForm(
        createOrganizationRequestSchema,
        { name: "", type: "agent" },
        [
          {
            name: "name",
            label: "机构名称",
            validationMessage: "请填写机构名称",
          },
        ],
      ),
    ).toEqual({ success: false, errors: { name: ["请填写机构名称"] } });
  });
  it("version 由当前快照提供，保留初始版本 0，不能被字段数据覆盖", () => {
    expect(
      validateForm(
        updateOrganizationRequestSchema,
        { name: "测试机构", regionCode: null, version: 99 },
        [],
        0,
      ),
    ).toEqual({
      success: true,
      data: { name: "测试机构", regionCode: null, version: 0 },
    });
    expect(
      validateForm(
        updateOrganizationRequestSchema,
        { name: "测试机构", regionCode: null },
        [],
      ).success,
    ).toBe(false);
  });
  it("保留只读初值及布尔类型，不把未选复选框当缺失字段", () => {
    const values = initialFormValues(
      [{ name: "enabled", label: "启用", type: "checkbox" }],
      { version: 4 },
    );
    expect(validateForm(toggleOrganizationRequestSchema, values, [])).toEqual({
      success: true,
      data: { enabled: false, version: 4 },
    });
  });
  it("兼容原登录表单的定制文案", () => {
    expect(
      validateForm(loginRequestSchema, { account: "", password: "" }, [
        { name: "account", label: "账号", validationMessage: "请输入账号" },
        { name: "password", label: "密码", validationMessage: "请输入密码" },
      ]),
    ).toEqual({
      success: false,
      errors: { account: ["请输入账号"], password: ["请输入密码"] },
    });
  });
  it("保留服务端嵌套字段路径，不能丢弃未知字段及表单级错误", () => {
    const failure = formFailure(
      new ApiError(422, 90001, {
        fields: { "items.0.name": ["名称重复"], _request: ["当前配置无效"] },
      }),
    );
    expect(failure).toEqual({
      kind: "fields",
      errors: { "items.0.name": ["名称重复"], _request: ["当前配置无效"] },
    });
  });
  it("版本冲突必须重新加载；重复提交不当作保存成功", () => {
    expect(formFailure(new ApiError(409, 90002))).toMatchObject({
      kind: "conflict",
      message: expect.stringContaining("重新加载"),
    });
    expect(
      formFailure(new ApiError(409, 90003, { pending: true })),
    ).toMatchObject({
      kind: "duplicate",
      message: expect.stringContaining("确认结果"),
    });
    expect(formFailure(new Error("内部敏感错误"))).toEqual({
      kind: "error",
      message: "保存失败，请稍后重试。",
    });
  });
});

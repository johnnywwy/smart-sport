import { describe, expect, it } from "vitest";
import { validateNewPassword } from "../../src/modules/platform/auth/password-policy.js";

describe("密码策略", () => {
  it("生产环境拒绝默认密码、短密码和单一字符类型", () => {
    expect(
      validateNewPassword({ NODE_ENV: "production" }, "demo", "123456"),
    ).toEqual([
      "不能使用默认密码",
      "至少需要 8 个字符",
      "必须同时包含字母和数字",
    ]);
    expect(
      validateNewPassword({ NODE_ENV: "production" }, "demo", "abcdefgh"),
    ).toEqual(["必须同时包含字母和数字"]);
  });

  it("生产环境接受至少 8 位且同时包含字母和数字的密码", () => {
    expect(
      validateNewPassword({ NODE_ENV: "production" }, "demo", "Sport2026"),
    ).toEqual([]);
  });

  it("开发与测试环境允许默认密码用于种子和新建账号", () => {
    expect(
      validateNewPassword({ NODE_ENV: "development" }, "demo", "123456"),
    ).toEqual([]);
    expect(validateNewPassword({ NODE_ENV: "test" }, "demo", "123456")).toEqual(
      [],
    );
  });

  it("所有环境都拒绝与用户名相同的密码", () => {
    expect(validateNewPassword({ NODE_ENV: "test" }, "demo", "demo")).toEqual([
      "不能与用户名相同",
    ]);
  });
});

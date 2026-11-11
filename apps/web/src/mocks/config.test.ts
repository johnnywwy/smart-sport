import { describe, expect, it } from "vitest";
import { isMockedPath, parseMockPrefixes } from "./config";

describe("Mock 开关", () => {
  it.each([undefined, "", " ", "false"])("%s 默认关闭", (value) =>
    expect(parseMockPrefixes(value)).toEqual([]),
  );
  it("可按接口或前缀启用，去重并规范化末尾斜杠", () => {
    expect(
      parseMockPrefixes(
        " /api/v1/auth/login, /api/v1/auth/captcha/, /api/v1/auth/login ",
      ),
    ).toEqual(["/api/v1/auth/login", "/api/v1/auth/captcha"]);
    expect(parseMockPrefixes("true")).toEqual(["/api/v1"]);
  });
  it("前缀只匹配完整路径段，不误匹配近似名称", () => {
    expect(isMockedPath("/api/v1/auth/login", ["/api/v1/auth"])).toBe(true);
    expect(isMockedPath("/api/v1/authentication", ["/api/v1/auth"])).toBe(
      false,
    );
    expect(
      isMockedPath("/api/v1/auth/login-extra", ["/api/v1/auth/login"]),
    ).toBe(false);
  });
  it.each([
    "https://example.com/api/v1",
    "/api/v2/auth",
    "/api/v1/../users",
    "/api/v1/auth?secret=x",
    "/api/v1/auth,,",
    "auth",
  ])("拒绝不合法配置 %s", (value) =>
    expect(() => parseMockPrefixes(value)).toThrow(),
  );
});

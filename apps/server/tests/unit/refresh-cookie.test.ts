import type { ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import {
  readRefreshCookie,
  writeRefreshCookie,
} from "../../src/modules/platform/auth/refresh-cookie.js";

describe("refresh Cookie", () => {
  it("严格解析一个令牌，不接受重复值或编码注入", () => {
    const value = "a".repeat(43);
    expect(readRefreshCookie(`other=value; refresh_token=${value}`)).toBe(
      value,
    );
    expect(
      readRefreshCookie(`refresh_token=${value}; refresh_token=${value}`),
    ).toBeUndefined();
    expect(readRefreshCookie("refresh_token=%0a")).toBeUndefined();
  });
  it("生产签发和清理都使用 Secure 和相同作用路径", () => {
    const headers = new Map();
    const response = {
      setHeader: (key: string, value: string) => headers.set(key, value),
    } as unknown as ServerResponse;
    writeRefreshCookie(response, "a".repeat(43), true, 120);
    expect(headers.get("Set-Cookie")).toContain("Max-Age=120; Secure");
    expect(headers.get("Set-Cookie")).toContain(
      "Path=/api/v1/auth; HttpOnly; SameSite=Strict",
    );
    writeRefreshCookie(response, null, true);
    expect(headers.get("Set-Cookie")).toContain("Max-Age=0; Secure");
  });
});

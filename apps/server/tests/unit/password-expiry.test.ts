import { expect, it } from "vitest";
import { passwordExpired } from "../../src/modules/platform/auth/password-expiry.js";
import { validateNewPassword } from "../../src/modules/platform/auth/password-policy.js";

it("有效期0禁用，缺少时间强制改密，边界达到整天即过期", () => {
  const now = new Date("2026-11-17T12:00:00Z"),
    changed = new Date("2026-11-16T12:00:00Z");
  expect(passwordExpired(null, 0, now)).toBe(false);
  expect(passwordExpired(null, 1, now)).toBe(true);
  expect(passwordExpired(changed, 1, now)).toBe(true);
  expect(passwordExpired(changed, 1, new Date(now.getTime() - 1))).toBe(false);
  expect(passwordExpired(new Date(now.getTime() + 1), 1, now)).toBe(false);
});
it("生产改密采用动态最短长度，开发默认密码例外仍保留", () => {
  expect(
    validateNewPassword({ NODE_ENV: "production" }, "demo", "Sport2026", 12),
  ).toContain("至少需要 12 个字符");
  expect(
    validateNewPassword(
      { NODE_ENV: "production" },
      "demo",
      "Sport2026abcd",
      12,
    ),
  ).toEqual([]);
  expect(
    validateNewPassword({ NODE_ENV: "test" }, "demo", "123456", 64),
  ).toEqual([]);
});

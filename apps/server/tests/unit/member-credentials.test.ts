import { randomBytes } from "node:crypto";
import type { ServerConfig } from "@smart-sport/config/env";
import { describe, expect, it } from "vitest";
import { MemberCredentials } from "../../src/infra/crypto/member-credentials.js";

const config = {
  NODE_ENV: "test",
  FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  STUDENT_HMAC_KEY: randomBytes(32).toString("base64"),
} as ServerConfig;
describe("成员初始凭证", () => {
  it("档案联系电话支持固定电话脱敏，短号码不能暴露全部数字", () => {
    const credentials = new MemberCredentials(config);
    expect(
      credentials.maskedContactPhone(credentials.encryptPhone("0571-12345678")),
    ).toBe("057****5678");
    expect(
      credentials.maskedContactPhone(credentials.encryptPhone("12345")),
    ).toBe("****45");
    expect(credentials.maskedContactPhone(null)).toBeNull();
  });
  it("开发和测试使用约定初值，生产使用12位字母数字随机密码", () => {
    expect(new MemberCredentials(config).initialPassword()).toBe("123456");
    const production = new MemberCredentials({
      ...config,
      NODE_ENV: "production",
    });
    const values = Array.from({ length: 50 }, () =>
      production.initialPassword(),
    );
    expect(new Set(values).size).toBe(50);
    for (const value of values) {
      expect(value).toHaveLength(12);
      expect(value).toMatch(/[A-Za-z]/);
      expect(value).toMatch(/\d/);
      expect(value).not.toBe("123456");
    }
  });
  it("手机号随机加密、稳定HMAC和默认脱敏，篡改或错误密钥无法解密", () => {
    const credentials = new MemberCredentials(config);
    const phone = "13800001234";
    const one = credentials.encryptPhone(phone),
      two = credentials.encryptPhone(phone);
    expect(one).not.toBe(two);
    expect(one).not.toContain(phone);
    expect(credentials.maskedPhone(one)).toBe("138****1234");
    expect(credentials.maskedPhone(null)).toBeNull();
    expect(credentials.phoneHash(phone)).toMatch(/^[0-9a-f]{64}$/);
    expect(credentials.phoneHash(phone)).toBe(credentials.phoneHash(phone));
    expect(credentials.phoneHash("13900001234")).not.toBe(
      credentials.phoneHash(phone),
    );
    const wrong = new MemberCredentials({
      ...config,
      FIELD_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    });
    expect(() => wrong.maskedPhone(one)).toThrow();
    expect(() => credentials.maskedPhone("v2:invalid")).toThrow();
    const parts = one.split(":");
    parts[2] = Buffer.from("tampered").toString("base64");
    expect(() => credentials.maskedPhone(parts.join(":"))).toThrow();
  });
});

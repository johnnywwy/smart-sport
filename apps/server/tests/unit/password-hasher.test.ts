import { describe, expect, it } from "vitest";
import { PasswordHasher } from "../../src/infra/crypto/password-hasher.js";

const hasher = new PasswordHasher();

describe("argon2id 密码哈希", () => {
  it("生成可存入规格 password_hash 列的 PHC 编码", async () => {
    const encoded = await hasher.hash("123456");
    expect(encoded).toMatch(/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$/);
    expect(encoded.length).toBeLessThanOrEqual(255);
    expect(encoded).not.toContain("123456");
    expect(await hasher.verify(encoded, "123456")).toBe(true);
  });

  it("错误密码无法通过校验", async () => {
    const encoded = await hasher.hash("CorrectPassword9");
    expect(await hasher.verify(encoded, "WrongPassword9")).toBe(false);
  });

  it("同一密码每次生成不同随机盐", async () => {
    const first = await hasher.hash("SamePassword9");
    const second = await hasher.hash("SamePassword9");
    expect(first).not.toBe(second);
    expect(await hasher.verify(first, "SamePassword9")).toBe(true);
    expect(await hasher.verify(second, "SamePassword9")).toBe(true);
  });

  it("不裁剪或正规化用户密码", async () => {
    const password = " 密码Pass9 ";
    const encoded = await hasher.hash(password);
    expect(await hasher.verify(encoded, password)).toBe(true);
    expect(await hasher.verify(encoded, password.trim())).toBe(false);
  });

  it("长密码尾部的差异仍然影响校验", async () => {
    const prefix = "a".repeat(128);
    const encoded = await hasher.hash(`${prefix}1`);
    expect(await hasher.verify(encoded, `${prefix}2`)).toBe(false);
  });

  it("损坏的编码抛出错误，不当作正常密码不匹配吞掉", async () => {
    await expect(hasher.verify("invalid-hash", "123456")).rejects.toThrow();
  });
});

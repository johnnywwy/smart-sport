import { describe, expect, it } from "vitest";
import { Audit } from "../../src/core/audit/audit.decorator.js";
import { auditChanges } from "../../src/core/audit/audit-changes.js";
import { auditPartition } from "../../src/modules/platform/audit/audit-partitions.repository.js";

describe("字段级审计", () => {
  it("仅保留改变的字段，兼容新增、清空与缺失字段", () => {
    expect(
      auditChanges({
        before: { name: "原名", same: 1, removed: "原值" },
        after: { name: "新名", same: 1, added: true },
        reason: "说明",
      }),
    ).toEqual({
      name: ["原名", "新名"],
      removed: ["原值", null],
      added: [null, true],
      reason: "说明",
    });
    expect(auditChanges({ before: null, after: { name: "新增" } })).toEqual({
      name: [null, "新增"],
    });
    expect(auditChanges({ before: { name: "新增" }, after: null })).toEqual({
      name: ["新增", null],
    });
  });
  it("现有字段差异和事件元数据保留，时间序列化，深层内容去敏", () => {
    const changes = {
      name: ["原名", "新名"],
      scopes: [[{ schoolId: "甲" }], [{ schoolId: "乙" }]],
      result: "success",
      when: new Date("2026-01-01T00:00:00Z"),
      nested: { phone_hash: "不能保存", passwordHash: "不能保存" },
    };
    expect(auditChanges(changes)).toEqual({
      ...changes,
      when: "2026-01-01T00:00:00.000Z",
      nested: { phone_hash: "已修改", passwordHash: "已修改" },
    });
    expect(auditChanges(null)).toBeNull();
  });
  it("密码、电话、证件与令牌的前后值和嵌套值都不落审计", () => {
    const input = {
      before: { phone: "13800000000", nested: { access_token: "old-secret" } },
      after: { phone: "13900000000", nested: { access_token: "new-secret" } },
      details: [{ idCardNumber: "123456789012345678", refreshToken: "secret" }],
      password: "plaintext",
    };
    const copy = JSON.stringify(input);
    const output = auditChanges(input);
    expect(output).toMatchObject({
      phone: "已修改",
      password: "已修改",
      nested: [{ access_token: "已修改" }, { access_token: "已修改" }],
      details: [{ idCardNumber: "已修改", refreshToken: "已修改" }],
    });
    expect(JSON.stringify(output)).not.toMatch(
      /13800000000|13900000000|123456789012345678|old-secret|new-secret|plaintext/,
    );
    expect(JSON.stringify(input)).toBe(copy);
  });
  it("密码策略是普通配置数值，不会因参数名带password被吞掉", () => {
    expect(
      auditChanges({
        key: "password.min_length",
        before: { value: 8 },
        after: { value: 12 },
        reason: "调整策略",
      }),
    ).toEqual({
      key: "password.min_length",
      value: [8, 12],
      reason: "调整策略",
    });
  });
  it("特殊字段名不会改变对象原型", () => {
    const value = JSON.parse(
      '{"before":{},"after":{"__proto__":{"polluted":true}}}',
    );
    const result = auditChanges(value) as Record<string, unknown>;
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(result, "__proto__")?.value).toEqual(
      [null, { polluted: true }],
    );
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect("polluted" in {}).toBe(false);
  });
  it("装饰器保留this与事务，复制输入且原样传播写入失败", async () => {
    class Writer {
      readonly expected = {};
      @Audit()
      async write(tx: object, input: { changes?: unknown }) {
        expect(tx).toBe(this.expected);
        if (input.changes === null) throw new Error("数据库写入失败");
        return input;
      }
    }
    const writer = new Writer();
    const input = { changes: { before: { value: 1 }, after: { value: 2 } } };
    expect(await writer.write(writer.expected, input)).toEqual({
      changes: { value: [1, 2] },
    });
    expect(input.changes).toEqual({
      before: { value: 1 },
      after: { value: 2 },
    });
    await expect(writer.write(writer.expected, {})).rejects.toThrow(
      "数据库写入失败",
    );
  });
});

describe("上海月分区边界", () => {
  it("月份递进、跨年、闰年均固定在上海月初", () => {
    expect(auditPartition("2026_12")).toEqual({
      name: "audit_logs_2026_12",
      from: "2026-12-01T00:00:00+08:00",
      to: "2027-01-01T00:00:00+08:00",
    });
    expect(auditPartition("2028_02").to).toBe("2028-03-01T00:00:00+08:00");
  });
  it("拒绝外部表名、越界日期和SQL片段", () => {
    for (const month of [
      "2026_00",
      "2026_13",
      "2026_1",
      "0000_01",
      "9999_12",
      "2026_11;DROP TABLE users",
      "audit_logs_2026_11",
    ])
      expect(() => auditPartition(month)).toThrow();
  });
});

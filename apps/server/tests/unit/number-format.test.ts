import { expect, it } from "vitest";
import { planNumber } from "../../src/modules/foundation/numbers/number-format.js";

const rule = {
  prefix: "KT",
  digits: 6,
  reset: "yearly" as const,
  year: 2026,
  currentValue: 44,
};
it("生成固定格式与补零，不改变输入；小年份补足四位", () => {
  expect(planNumber(rule, 2026, 0)).toMatchObject({
    no: "KT-2026-000045",
    value: 45,
    error: null,
  });
  expect(rule.currentValue).toBe(44);
  expect(planNumber({ ...rule, year: 1, currentValue: 0 }, 1, 0).no).toBe(
    "KT-0001-000001",
  );
});
it("每年重置和永不重置都使用当年年份，只有年度档重新计数", () => {
  expect(planNumber(rule, 2027, 0)).toMatchObject({
    no: "KT-2027-000001",
    year: 2027,
  });
  expect(planNumber({ ...rule, reset: "never" }, 2027, 0).no).toBe(
    "KT-2027-000045",
  );
});
it("历史前缀被复用或规则重建时跳过已发流水，即使位数发生变化", () => {
  expect(planNumber({ ...rule, currentValue: 0 }, 2026, 124).no).toBe(
    "KT-2026-000125",
  );
  expect(
    planNumber({ ...rule, digits: 4, currentValue: 0 }, 2026, 124).no,
  ).toBe("KT-2026-0125");
});
it("流水用尽不截断、不扩位，12位最大值仍能精确处理", () => {
  expect(
    planNumber({ ...rule, digits: 2, currentValue: 99 }, 2026, 0),
  ).toMatchObject({ error: 30001, no: null });
  expect(
    planNumber({ ...rule, digits: 12, currentValue: 999999999998 }, 2026, 0).no,
  ).toBe("KT-2026-999999999999");
  expect(
    planNumber({ ...rule, digits: 12, currentValue: 999999999999 }, 2026, 0),
  ).toMatchObject({ error: 30001, no: null });
});
it("时钟回退拒绝分配，任何重置方式都不回拨到历史年度", () => {
  expect(planNumber(rule, 2025, 0)).toMatchObject({ error: 30003, no: null });
  expect(planNumber({ ...rule, reset: "never" }, 2025, 0)).toMatchObject({
    error: 30003,
    no: null,
  });
});

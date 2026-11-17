import type { NumberRule } from "@smart-sport/contracts";

type Counter = Pick<
  NumberRule,
  "prefix" | "digits" | "reset" | "year" | "currentValue"
>;
/** 预览与分配共用算法；不截断溢出，不因时钟倒退重新从1开始。 */
export function planNumber(rule: Counter, year: number, lastIssued: number) {
  if (year < rule.year)
    return { year, value: 0, no: null, error: 30003 as const };
  const previous =
    rule.reset === "yearly" && year > rule.year ? 0 : rule.currentValue;
  const value = Math.max(previous, lastIssued) + 1;
  if (value >= 10 ** rule.digits)
    return { year, value, no: null, error: 30001 as const };
  return {
    year,
    value,
    no: `${rule.prefix}-${String(year).padStart(4, "0")}-${String(value).padStart(rule.digits, "0")}`,
    error: null,
  };
}

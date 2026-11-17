import { numberRuleSchema } from "@smart-sport/contracts";

export const numberRuleExample = numberRuleSchema.parse({
  id: "019a87ce-7000-7000-8000-000000000001",
  type: "subscription_request",
  name: "开通申请",
  prefix: "KT",
  digits: 6,
  reset: "yearly",
  year: 2026,
  currentValue: 44,
  nextNumber: "KT-2026-000045",
  version: 0,
  allowedActions: ["update"],
});

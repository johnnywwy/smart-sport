import {
  appDefinitions,
  schoolAppSchema,
  subscriptionSchema,
} from "@smart-sport/contracts";
import {
  shanghaiDate,
  subscriptionGraceEnd,
  subscriptionStatus,
} from "@smart-sport/domain";
import type { schoolApps } from "../../../schema/public.js";
import type { SubscriptionRow } from "./subscription.repository.js";
export function schoolAppResponse(row: typeof schoolApps.$inferSelect) {
  return schoolAppSchema.parse({
    code: row.appCode,
    name:
      appDefinitions.find((app) => app.code === row.appCode)?.name ?? "应用",
    startDate: shanghaiDate(row.startDate),
    endDate: shanghaiDate(row.endDate),
    source: row.source,
  });
}
export function subscriptionResponse(
  row: SubscriptionRow,
  schoolName: string,
  salesName: string | null,
  today: string,
) {
  return subscriptionSchema.parse({
    ...row,
    schoolName,
    salesName,
    serviceStart: shanghaiDate(row.serviceStart),
    serviceEnd: shanghaiDate(row.serviceEnd),
    graceEnd: subscriptionGraceEnd(row),
    status: subscriptionStatus(row, today),
    allowedActions: ["view"],
  });
}

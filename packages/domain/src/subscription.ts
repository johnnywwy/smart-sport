import { appRegistry, type SubscriptionStatus } from "@smart-sport/contracts";

export type ServicePeriod = {
  serviceStart: Date;
  serviceEnd: Date;
  graceDays: number;
  contractNo: string | null;
};
export type AppPeriod = { appCode: string; startDate: Date; endDate: Date };
export function shanghaiDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-");
}
export function calendarDays(date: string, count: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
export const shanghaiInstant = (date: string) =>
  new Date(`${date}T00:00:00+08:00`);
export const subscriptionGraceEnd = (period: ServicePeriod) =>
  calendarDays(shanghaiDate(period.serviceEnd), period.graceDays);
export function subscriptionStatus(
  period: ServicePeriod | null,
  today: string,
): SubscriptionStatus {
  if (!period || today < shanghaiDate(period.serviceStart)) return "suspended";
  if (today <= shanghaiDate(period.serviceEnd))
    return period.contractNo === null ? "trial" : "active";
  return today <= subscriptionGraceEnd(period) ? "grace" : "suspended";
}
/** 管理员判断始终使用原始最终角色权限，不能用被服务只读限制后的权限判断。 */
export function isSchoolAdministrator(
  identityType: string,
  permissions: ReadonlyMap<string, unknown>,
): boolean {
  return (
    identityType === "school" &&
    ["member", "role"].every((feature) => {
      const definition = appRegistry.org.features[feature as "member" | "role"];
      return definition.actions.every((action) =>
        permissions.has(`org:${feature}:${action}`),
      );
    })
  );
}
export function subscriptionAccessError(
  period: ServicePeriod | null,
  apps: AppPeriod[],
  today: string,
  app: string,
  action: string,
  administrator: boolean,
): 13001 | 13002 | 13003 | undefined {
  const status = subscriptionStatus(period, today);
  const entry = apps.find((item) => item.appCode === app);
  const basic = app === "school" || app === "org";
  if (status === "suspended") {
    if (
      period &&
      today > shanghaiDate(period.serviceEnd) &&
      administrator &&
      basic &&
      entry &&
      shanghaiDate(entry.startDate) <= today &&
      action === "export"
    )
      return;
    return 13003;
  }
  const valid =
    entry &&
    shanghaiDate(entry.startDate) <= today &&
    (today <= shanghaiDate(entry.endDate) ||
      (status === "grace" &&
        basic &&
        period &&
        shanghaiDate(entry.endDate) >= shanghaiDate(period.serviceEnd)));
  if (!valid) return 13001;
  if (status === "grace" && action !== "view" && action !== "export")
    return 13002;
  return;
}

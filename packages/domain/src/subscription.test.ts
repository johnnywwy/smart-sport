import { describe, expect, it } from "vitest";
import {
  calendarDays,
  isSchoolAdministrator,
  shanghaiDate,
  shanghaiInstant,
  subscriptionAccessError,
  subscriptionStatus,
} from "./subscription.js";

const period = {
  serviceStart: shanghaiInstant("2026-11-01"),
  serviceEnd: shanghaiInstant("2026-11-19"),
  graceDays: 2,
  contractNo: null,
};
const apps = [
  {
    appCode: "school",
    startDate: period.serviceStart,
    endDate: period.serviceEnd,
  },
];
describe("学校服务日历与访问规则", () => {
  it("试用和合同到期当天有效，宽限末日只读，次日停用", () => {
    for (const contractNo of [null, "合同一"]) {
      const p = { ...period, contractNo };
      expect(subscriptionStatus(p, "2026-11-19")).toBe(
        contractNo ? "active" : "trial",
      );
      expect(subscriptionStatus(p, "2026-11-20")).toBe("grace");
      expect(subscriptionStatus(p, "2026-11-21")).toBe("grace");
      expect(subscriptionStatus(p, "2026-11-22")).toBe("suspended");
      expect(subscriptionStatus({ ...p, graceDays: 0 }, "2026-11-20")).toBe(
        "suspended",
      );
    }
    expect(subscriptionStatus(period, "2026-10-31")).toBe("suspended");
    expect(subscriptionStatus(null, "2026-11-19")).toBe("suspended");
  });
  it("上海零时生效，跨月跨年及闰日准确", () => {
    expect(shanghaiDate(new Date("2026-11-19T15:59:59Z"))).toBe("2026-11-19");
    expect(shanghaiDate(new Date("2026-11-19T16:00:00Z"))).toBe("2026-11-20");
    expect(calendarDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(calendarDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("宽限不新增应用授权，基础应用保留查看导出，写入及独立到期应用拒绝", () => {
    for (const action of ["view", "export"])
      expect(
        subscriptionAccessError(
          period,
          apps,
          "2026-11-20",
          "school",
          action,
          false,
        ),
      ).toBeUndefined();
    expect(
      subscriptionAccessError(
        period,
        apps,
        "2026-11-20",
        "school",
        "update",
        true,
      ),
    ).toBe(13002);
    expect(
      subscriptionAccessError(period, [], "2026-11-20", "school", "view", true),
    ).toBe(13001);
    expect(
      subscriptionAccessError(
        period,
        [
          {
            startDate: period.serviceStart,
            endDate: period.serviceEnd,
            appCode: "other",
          },
        ],
        "2026-11-20",
        "other",
        "view",
        true,
      ),
    ).toBe(13001);
  });
  it("停用仅管理员导出已开通基础应用，不借此获得查看权限或未来服务", () => {
    expect(
      subscriptionAccessError(
        period,
        apps,
        "2026-11-22",
        "school",
        "export",
        true,
      ),
    ).toBeUndefined();
    expect(
      subscriptionAccessError(
        period,
        apps,
        "2026-11-22",
        "school",
        "view",
        true,
      ),
    ).toBe(13003);
    expect(
      subscriptionAccessError(
        period,
        apps,
        "2026-11-22",
        "school",
        "export",
        false,
      ),
    ).toBe(13003);
    expect(
      subscriptionAccessError(
        period,
        apps,
        "2026-10-01",
        "school",
        "export",
        true,
      ),
    ).toBe(13003);
  });
});

it("停用导出例外必须由同一学校身份拥有完整成员和角色管理能力", () => {
  const permissions = new Map(
    [
      "member:view",
      "member:create",
      "member:update",
      "member:delete",
      "member:import",
      "member:export",
      "role:view",
      "role:create",
      "role:update",
      "role:delete",
    ].map((code) => [`org:${code}`, "all"]),
  );
  expect(isSchoolAdministrator("school", permissions)).toBe(true);
  expect(isSchoolAdministrator("teacher", permissions)).toBe(false);
  permissions.delete("org:role:delete");
  expect(isSchoolAdministrator("school", permissions)).toBe(false);
});

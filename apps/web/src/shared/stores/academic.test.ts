import { beforeEach, expect, it } from "vitest";
import { useAcademic } from "./academic";
import { useSession } from "./session";

const period = { academicYearId: "year", semesterId: "term" };
beforeEach(() => {
  useAcademic.getState().clear();
});
it("手选只保存当前身份的查询上下文，选回当前可恢复默认跟随", () => {
  useAcademic.getState().select("first", period);
  expect(useAcademic.getState()).toMatchObject({
    identityId: "first",
    choice: period,
  });
  useAcademic.getState().select("first", null);
  expect(useAcademic.getState().choice).toBeNull();
});
it("旧日历或旧身份的失效结果不能清除刚选的新学期", () => {
  useAcademic.getState().select("new-identity", period);
  useAcademic.getState().discard("old-identity", period.semesterId);
  expect(useAcademic.getState().choice).toEqual(period);
  useAcademic.getState().discard("new-identity", "old-term");
  expect(useAcademic.getState().choice).toEqual(period);
  useAcademic.getState().discard("new-identity", period.semesterId);
  expect(useAcademic.getState().choice).toBeNull();
});
it("正常令牌续期保留选择，重新登录、选择身份和退出清空选择", () => {
  useAcademic.getState().select("actor", period);
  useSession
    .getState()
    .refreshToken("renewed", useSession.getState().generation);
  expect(useAcademic.getState().choice).toEqual(period);
  useSession.getState().startSession("new-account");
  expect(useAcademic.getState()).toMatchObject({
    choice: null,
    identityId: null,
  });
  useAcademic.getState().select("actor", period);
  useSession.getState().selectIdentity("identity-token", {
    id: "actor",
    type: "company",
    typeName: "公司",
    orgId: "company",
    orgName: "平台",
    departmentName: null,
    title: null,
    roleIds: [],
    lastUsed: true,
    available: true,
    unavailableReason: null,
  });
  expect(useAcademic.getState().choice).toBeNull();
  useAcademic.getState().select("actor", period);
  useSession.getState().clearSession();
  expect(useAcademic.getState()).toMatchObject({
    choice: null,
    identityId: null,
  });
});

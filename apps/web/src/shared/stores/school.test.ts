import { beforeEach, expect, it } from "vitest";
import { useSchool } from "./school";
import { useSession } from "./session";

const school = (id: string) => ({
  id,
  name: `学校${id}`,
  regionName: "测试地区",
});
beforeEach(() => useSchool.getState().clear());
it("跨菜单保留当前学校，最近五所去重并更新真实名称", () => {
  for (let i = 0; i < 7; i++) useSchool.getState().select(school(String(i)));
  useSchool.getState().select({ ...school("4"), name: "更新后的学校" });
  expect(useSchool.getState().recent.map((row) => row.id)).toEqual([
    "4",
    "6",
    "5",
    "3",
    "2",
  ]);
  expect(useSchool.getState().current?.name).toBe("更新后的学校");
});
it("过期校验结果不能清除刚选的新学校，失效历史会移除", () => {
  useSchool.getState().select(school("old"));
  useSchool.getState().select(school("new"));
  useSchool.getState().discard("old");
  expect(useSchool.getState().current?.id).toBe("new");
  expect(useSchool.getState().recent.map((row) => row.id)).toEqual(["new"]);
});
it("令牌正常续期保留学校，重新选择身份及退出清空当前与历史", () => {
  useSchool.getState().select(school("1"));
  useSession.getState().refreshToken("test", useSession.getState().generation);
  expect(useSchool.getState().current?.id).toBe("1");
  useSession.getState().startSession("account");
  expect(useSchool.getState()).toMatchObject({ current: null, recent: [] });
  useSchool.getState().select(school("2"));
  useSession.getState().clearSession();
  expect(useSchool.getState()).toMatchObject({ current: null, recent: [] });
});

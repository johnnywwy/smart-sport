import { beforeEach, describe, expect, it } from "vitest";
import { useSession } from "./session";
import { pathAfterClosingTab, useWorkspaceTabs } from "./workspace-tabs";

beforeEach(() => useWorkspaceTabs.getState().clear());
describe("模块页签", () => {
  it("按身份和模块隔离，重复访问不重复开页签，关闭其他保留当前", () => {
    const store = useWorkspaceTabs.getState();
    const student = { path: "/m/base/students", name: "学生管理" };
    const teacher = { path: "/m/base/teachers", name: "教师管理" };
    store.open("identity:base", student);
    store.open("identity:base", student);
    store.open("identity:base", teacher);
    store.open("other:base", student);
    store.closeOthers("identity:base", teacher.path);
    expect(useWorkspaceTabs.getState().tabs["identity:base"]).toEqual([
      teacher,
    ]);
    expect(useWorkspaceTabs.getState().tabs["other:base"]).toEqual([student]);
    store.close("identity:base", teacher.path);
    expect(useWorkspaceTabs.getState().tabs["identity:base"]).toEqual([]);
    expect(useWorkspaceTabs.getState().recent["identity:base"]).toEqual([
      teacher,
      student,
    ]);
  });
  it("退出或重新登录立即清除所有身份的页签", () => {
    useWorkspaceTabs
      .getState()
      .open("old:base", { path: "/m/base/students", name: "学生管理" });
    useSession.getState().clearSession();
    expect(useWorkspaceTabs.getState().tabs).toEqual({});
    useWorkspaceTabs
      .getState()
      .open("new:base", { path: "/m/base/students", name: "学生管理" });
    useSession.getState().startSession("new-session");
    expect(useWorkspaceTabs.getState().tabs).toEqual({});
  });
});

describe("关闭页签后的导航", () => {
  const home = "/m/base/workbench";
  const tabs = [
    { path: "/m/base/students", name: "学生管理" },
    { path: "/m/base/teachers", name: "教师管理" },
    { path: "/m/base/classes", name: "班级管理" },
  ] satisfies [unknown, unknown, unknown];
  it("关闭当前页签跳剩余最后一个，而不是总回工作台", () => {
    expect(pathAfterClosingTab(tabs, tabs[0].path, tabs[0].path, home)).toBe(
      tabs[2].path,
    );
    expect(pathAfterClosingTab(tabs, tabs[2].path, tabs[2].path, home)).toBe(
      tabs[1].path,
    );
  });
  it("关闭非当前页签不切页，最后一个关闭后回工作台", () => {
    expect(pathAfterClosingTab(tabs, tabs[0].path, tabs[1].path, home)).toBe(
      tabs[1].path,
    );
    expect(
      pathAfterClosingTab([tabs[0]], tabs[0].path, tabs[0].path, home),
    ).toBe(home);
    expect(pathAfterClosingTab([], tabs[0].path, tabs[0].path, home)).toBe(
      home,
    );
  });
});

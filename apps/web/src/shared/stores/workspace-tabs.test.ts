import { beforeEach, describe, expect, it } from "vitest";
import { useSession } from "./session";
import { useWorkspaceTabs } from "./workspace-tabs";

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

import { beforeEach, describe, expect, it } from "vitest";
import { useApiEvents } from "./api-events";

beforeEach(() =>
  useApiEvents.setState({
    notices: [],
    navigation: null,
    availableVersion: null,
  }),
);

describe("API 提示状态", () => {
  it("同一批并发失败只提示一次，读取通知后清空队列", () => {
    useApiEvents.getState().notifyError("缺少权限");
    useApiEvents.getState().notifyError("缺少权限");
    expect(useApiEvents.getState().drainNotices()).toEqual([
      { variant: "danger", title: "操作失败", message: "缺少权限" },
    ]);
    expect(useApiEvents.getState().drainNotices()).toEqual([]);
  });
  it("成功和失败使用独立样式并允许设置标题", () => {
    useApiEvents.getState().notifySuccess("学生已保存", "已新增");
    useApiEvents.getState().notifyError("数据已被修改", "保存失败");
    expect(useApiEvents.getState().drainNotices()).toEqual([
      { variant: "success", title: "已新增", message: "学生已保存" },
      { variant: "danger", title: "保存失败", message: "数据已被修改" },
    ]);
  });
  it("只在服务端版本与构建版本不一致时显示更新提示", () => {
    useApiEvents.getState().observeVersion(__APP_VERSION__);
    expect(useApiEvents.getState().availableVersion).toBeNull();
    useApiEvents.getState().observeVersion(`${__APP_VERSION__}-updated`);
    expect(useApiEvents.getState().availableVersion).toBe(
      `${__APP_VERSION__}-updated`,
    );
  });
});

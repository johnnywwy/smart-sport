import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { createBrowserGateScript } from "./browser-gate";

function runGate(userAgent: string, pathname: string, readyState = "complete") {
  const removeAttribute = vi.fn();
  const replace = vi.fn();
  const listeners: (() => void)[] = [];
  const window = {
    location: { pathname, replace },
    addEventListener: (_event: string, listener: () => void) =>
      listeners.push(listener),
    __SMART_SPORT_BROWSER_SUPPORTED__: undefined as boolean | undefined,
  };
  const document = {
    title: "智慧体育云平台",
    readyState,
    getElementById: () => ({ removeAttribute }),
  };
  runInNewContext(createBrowserGateScript(), {
    window,
    navigator: { userAgent },
    document,
  });
  return { window, document, replace, removeAttribute, listeners };
}

describe("经典入口检测脚本", () => {
  it("使用 ES5 语法，不依赖主包、现代 API 或模块", () => {
    expect(createBrowserGateScript()).not.toMatch(
      /\b(?:const|let|import|export)\b|=>|\?\.|\?\?/,
    );
  });
  it("新版浏览器放行，不跳转或显示静态提示", () => {
    const result = runGate("Chrome/111.0.0.0", "/preview/portal");
    expect(result.window.__SMART_SPORT_BROWSER_SUPPORTED__).toBe(true);
    expect(result.replace).not.toHaveBeenCalled();
    expect(result.removeAttribute).not.toHaveBeenCalled();
  });
  it("旧浏览器从业务入口跳转升级页", () => {
    const result = runGate("Chrome/110.0.0.0", "/preview/workspace");
    expect(result.window.__SMART_SPORT_BROWSER_SUPPORTED__).toBe(false);
    expect(result.replace).toHaveBeenCalledExactlyOnceWith("/upgrade-browser");
  });
  it.each(["/upgrade-browser", "/upgrade-browser/"])(
    "旧浏览器访问 %s 不循环跳转，显示静态内容",
    (path) => {
      const result = runGate("Trident/7.0", path);
      expect(result.replace).not.toHaveBeenCalled();
      expect(result.removeAttribute).toHaveBeenCalledExactlyOnceWith("hidden");
      expect(result.document.title).toContain("升级浏览器");
    },
  );
  it("文档仍在加载时等 DOM 可用再显示提示", () => {
    const result = runGate("Chrome/110.0.0.0", "/upgrade-browser", "loading");
    expect(result.removeAttribute).not.toHaveBeenCalled();
    result.listeners[0]?.();
    expect(result.removeAttribute).toHaveBeenCalledExactlyOnceWith("hidden");
  });
});

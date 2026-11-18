import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { createBrowserGateScript } from "./browser-gate";

function runGate(
  userAgent: string,
  pathname: string,
  readyState = "complete",
  capabilities: Record<string, unknown> = {},
) {
  const removeAttribute = vi.fn();
  const replace = vi.fn();
  const listeners: (() => void)[] = [];
  const window = {
    ...capabilities,
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

const observerStub = () => undefined;

const modernCapabilities = () => ({
  CSS: { supports: () => true, registerProperty: () => undefined },
  Promise,
  fetch: () => undefined,
  URL,
  AbortController,
  ResizeObserver: observerStub,
});

describe("内置浏览器实际能力检测", () => {
  it.each([
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.63",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/110.0.0.0 Mobile MicroMessenger/8.0.63",
    "UnknownEmbeddedBrowser/1.0",
  ])("有完整运行能力时放行，UA不决定结果：%s", (ua) => {
    const result = runGate(ua, "/login", "complete", modernCapabilities());
    expect(result.window.__SMART_SPORT_BROWSER_SUPPORTED__).toBe(true);
    expect(result.replace).not.toHaveBeenCalled();
  });
  it("声称版本很新但缺少实际CSS能力仍拦截", () => {
    const capabilities = modernCapabilities();
    capabilities.CSS.supports = () => false;
    const result = runGate(
      "Chrome/999.0.0.0",
      "/login",
      "complete",
      capabilities,
    );
    expect(result.replace).toHaveBeenCalledExactlyOnceWith("/upgrade-browser");
  });
  it("Firefox旧内核缺少注册CSS属性时仍拦截", () => {
    const capabilities = {
      ...modernCapabilities(),
      CSS: { supports: () => true },
    };
    const result = runGate("Firefox/127.0", "/login", "complete", capabilities);
    expect(result.window.__SMART_SPORT_BROWSER_SUPPORTED__).toBe(false);
  });
});

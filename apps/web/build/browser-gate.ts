import type { Plugin } from "vite";
import {
  browserMinimumVersions,
  browserRequirements,
  isSupportedBrowser,
} from "../src/shared/browser/browser-support";

export function createBrowserGateScript() {
  return `(function () {
    var supported = (${isSupportedBrowser.toString()})(navigator.userAgent, ${JSON.stringify(browserMinimumVersions)});
    window.__SMART_SPORT_BROWSER_SUPPORTED__ = supported;
    if (supported) return;
    if (window.location.pathname !== "/upgrade-browser" && window.location.pathname !== "/upgrade-browser/") {
      window.location.replace("/upgrade-browser");
      return;
    }
    function revealUpgrade() {
      document.title = "升级浏览器 · 智慧体育云平台";
      var content = document.getElementById("browser-upgrade");
      if (content) content.removeAttribute("hidden");
    }
    if (document.readyState === "complete") revealUpgrade();
    else if (window.addEventListener) window.addEventListener("load", revealUpgrade);
    else window.attachEvent("onload", revealUpgrade);
  })();`;
}

export function browserGatePlugin(): Plugin {
  return {
    name: "smart-sport-browser-gate",
    transformIndexHtml: {
      order: "post",
      handler: (html) => ({
        html: html.replace(
          "<!-- 浏览器版本列表由入口插件按统一配置生成。 -->",
          `<ul>${browserRequirements.map((browser) => `<li>${browser.name} ${browser.minimumVersion}</li>`).join("")}</ul>`,
        ),
        tags: [
          {
            tag: "script",
            attrs: { "data-browser-gate": "" },
            children: createBrowserGateScript(),
            injectTo: "head",
          },
        ],
      }),
    },
  };
}

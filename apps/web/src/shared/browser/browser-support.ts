export const browserMinimumVersions = {
  chrome: 111,
  edge: 111,
  firefox: 128,
  safariMajor: 16,
  safariMinor: 4,
};

export const browserRequirements = [
  {
    name: "Google Chrome",
    minimumVersion: `${browserMinimumVersions.chrome}+`,
    href: "https://www.google.com/chrome/",
    action: "下载 Chrome",
  },
  {
    name: "Microsoft Edge",
    minimumVersion: `${browserMinimumVersions.edge}+`,
    href: "https://www.microsoft.com/edge/download",
    action: "下载 Edge",
  },
  {
    name: "Mozilla Firefox",
    minimumVersion: `${browserMinimumVersions.firefox}+`,
    href: "https://www.mozilla.org/firefox/new/",
    action: "下载 Firefox",
  },
  {
    name: "Apple Safari",
    minimumVersion: `${browserMinimumVersions.safariMajor}.${browserMinimumVersions.safariMinor}+`,
    href: "https://support.apple.com/102665",
    action: "了解如何更新 Safari",
  },
];

// 此函数会原样内联到经典入口脚本：只使用 ES5 语法与 API，不引用模块作用域。
export function isSupportedBrowser(
  userAgent: string,
  minimums: typeof browserMinimumVersions,
): boolean {
  var match: RegExpExecArray | null;
  var major: number;
  var minor: number;
  if (
    /MSIE|Trident\/|Edge\/|OPR\/|Opera\/|SamsungBrowser\/|UCBrowser\//.test(
      userAgent,
    )
  )
    return false;
  // iOS 的第三方浏览器不能按桌面 Chrome / Firefox 版本推断引擎能力。
  if (/CriOS\/|FxiOS\/|EdgiOS\//.test(userAgent)) return false;
  match = /Edg(?:A)?\/(\d+)/.exec(userAgent);
  if (match) return parseInt(match[1] || "0", 10) >= minimums.edge;
  match = /Firefox\/(\d+)/.exec(userAgent);
  if (match) return parseInt(match[1] || "0", 10) >= minimums.firefox;
  match = /(?:Chrome|Chromium)\/(\d+)/.exec(userAgent);
  if (match) return parseInt(match[1] || "0", 10) >= minimums.chrome;
  match = /Version\/(\d+)(?:\.(\d+))?/.exec(userAgent);
  if (match && /Safari\//.test(userAgent)) {
    major = parseInt(match[1] || "0", 10);
    minor = parseInt(match[2] || "0", 10);
    return (
      major > minimums.safariMajor ||
      (major === minimums.safariMajor && minor >= minimums.safariMinor)
    );
  }
  return false;
}

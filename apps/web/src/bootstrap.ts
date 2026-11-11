// 检测通过后才加载主应用。
if (window.__SMART_SPORT_BROWSER_SUPPORTED__ === true) {
  void import("./main");
}

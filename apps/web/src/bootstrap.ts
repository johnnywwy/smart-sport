async function bootstrap() {
  // 检测通过后才加载 Mock 或主应用；Mock 必须先就绪，避免首批请求穿透。
  if (window.__SMART_SPORT_BROWSER_SUPPORTED__ !== true) return;
  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_MOCK &&
    import.meta.env.VITE_MOCK !== "false"
  ) {
    const { startMocking } = await import("./mocks/browser");
    await startMocking(import.meta.env.VITE_MOCK);
  }
  await import("./main");
}

void bootstrap();

import { setupWorker } from "msw/browser";
import { parseMockPrefixes } from "./config";
import { createMockHandlers } from "./handlers";

export async function startMocking(value: string | undefined) {
  const prefixes = parseMockPrefixes(value);
  if (!prefixes.length) return;
  const handlers = createMockHandlers(prefixes, window.location.origin);
  if (!handlers.length) throw new Error("VITE_MOCK 没有匹配到已实现的模拟接口");
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledFrame: "bypass", quiet: true });
  import.meta.hot?.dispose(() => {
    void worker.stop();
  });
  console.info(`[Mock] 已启用：${prefixes.join(", ")}；其他接口访问真实后端`);
}

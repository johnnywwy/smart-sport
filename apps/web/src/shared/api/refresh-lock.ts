// Cookie 由同源标签页共享；锁内等响应完成后，下一页再携带轮换后的 Cookie。
// access token 仍由每个标签页分别获取，不存储或广播。
export async function withRefreshLock<T>(refresh: () => Promise<T>) {
  if (typeof navigator === "undefined" || !navigator.locks) return refresh();
  return navigator.locks.request("smart-sport:auth-refresh", refresh);
}

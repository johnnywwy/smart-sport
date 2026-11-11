import { apiResponseSchema } from "@smart-sport/contracts";
import { ApiError } from "./api-error";
import { createRequestSignal } from "./request-signal";

export async function transport(
  fetcher: typeof fetch,
  path: string,
  init: RequestInit,
  timeoutMs: number,
  onVersion?: (version: string) => void,
) {
  const requestSignal = createRequestSignal(init.signal, timeoutMs);
  try {
    const response = await fetcher(path, {
      ...init,
      signal: requestSignal.signal,
      credentials: "same-origin",
      redirect: "error",
    });
    const version = response.headers.get("X-App-Version");
    if (version) onVersion?.(version);
    const parsed = apiResponseSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success)
      throw new ApiError(
        response.status,
        null,
        null,
        null,
        "服务响应格式异常，请稍后重试",
      );
    const envelope = parsed.data;
    if (!response.ok || envelope.code !== 0) {
      throw new ApiError(
        response.status,
        envelope.code || null,
        envelope.data,
        envelope.traceId,
        envelope.message,
      );
    }
    return envelope.data;
  } catch (error) {
    if (requestSignal.signal.aborted) {
      if (
        requestSignal.signal.reason instanceof DOMException &&
        requestSignal.signal.reason.name === "TimeoutError"
      ) {
        throw new ApiError(0, null, null, null, "请求超时，请稍后重试");
      }
      throw requestSignal.signal.reason;
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, null, null, null, "网络连接失败，请稍后重试");
  } finally {
    requestSignal.dispose();
  }
}

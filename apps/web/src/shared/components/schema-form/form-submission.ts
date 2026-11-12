import type { FormSubmissionContext } from "./types";

/** 同一份数据失败重试复用键；修改数据后新建键，避免重放旧结果。 */
export function createFormSubmission(
  createKey: () => string = () => crypto.randomUUID(),
) {
  let key: string = createKey();
  let fingerprint: string | undefined;
  let busy = false;
  let controller = new AbortController();
  return {
    async run<T>(
      values: T,
      submit: (values: T, context: FormSubmissionContext) => Promise<void>,
    ) {
      if (busy) return false;
      busy = true;
      try {
        // 只保留摘要，不在提交控制器中保存密码等表单明文。
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(values)),
        );
        const next = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        controller.signal.throwIfAborted();
        if (fingerprint !== undefined && fingerprint !== next)
          key = createKey();
        fingerprint = next;
        await submit(values, {
          idempotencyKey: key,
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        return true;
      } finally {
        busy = false;
      }
    },
    reset() {
      controller.abort();
      controller = new AbortController();
      fingerprint = undefined;
      key = createKey();
    },
    dispose() {
      controller.abort();
    },
  };
}

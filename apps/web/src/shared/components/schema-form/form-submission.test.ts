import {
  emptyResultSchema,
  updateOrganizationRequestSchema,
} from "@smart-sport/contracts";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/api-error";
import { createApiClient } from "../../api/create-api-client";
import { validateForm } from "./form-state";
import { createFormSubmission } from "./form-submission";
import type { FormSubmissionContext } from "./types";

function keys() {
  let count = 0;
  return () => `key-${++count}`;
}
describe("表单提交周期", () => {
  it("失败后相同数据复用键，修改后换键，重开表单也换键", async () => {
    const form = createFormSubmission(keys());
    const seen: string[] = [];
    const submit = async (_values: unknown, context: FormSubmissionContext) => {
      seen.push(context.idempotencyKey);
      throw new Error("网络中断");
    };
    await expect(form.run({ name: "机构一" }, submit)).rejects.toThrow();
    await expect(form.run({ name: "机构一" }, submit)).rejects.toThrow();
    await expect(form.run({ name: "机构二" }, submit)).rejects.toThrow();
    form.reset();
    await expect(form.run({ name: "机构二" }, submit)).rejects.toThrow();
    expect(seen).toEqual(["key-1", "key-1", "key-2", "key-3"]);
  });
  it("同步锁阻止快速重复点击，即使摘要和网络仍未完成", async () => {
    const form = createFormSubmission(keys());
    const submit = vi.fn(async () => {});
    const first = form.run({ name: "测试" }, submit);
    expect(await form.run({ name: "测试" }, submit)).toBe(false);
    expect(await first).toBe(true);
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it("表单卸载后中止信号，丢弃迟到结果", async () => {
    const form = createFormSubmission(keys());
    let finish = () => {};
    let started = () => {};
    let signal: AbortSignal | undefined;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const task = form.run({}, async (_values, context) => {
      signal = context.signal;
      started();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const rejection = expect(task).rejects.toMatchObject({
      name: "AbortError",
    });
    await ready;
    form.dispose();
    expect(signal?.aborted).toBe(true);
    finish();
    await rejection;
  });
  it("通过真实 API 客户端传递 version 和 Idempotency-Key，网络失败重试不换键", async () => {
    const requests: RequestInit[] = [];
    const client = createApiClient({
      session: {
        get: () => ({ generation: 1, accessToken: "test-token" }),
        refreshToken: () => {},
        clear: () => {},
      },
      fetch: async (_url, init) => {
        if (init) requests.push(init);
        if (requests.length === 1) throw new Error("网络中断");
        return Response.json({
          code: 0,
          message: "ok",
          data: null,
          traceId: "test-trace",
        });
      },
    });
    const parsed = validateForm(
      updateOrganizationRequestSchema,
      { name: "测试机构", regionCode: null },
      [],
      7,
    );
    if (!parsed.success) throw new Error("测试契约无效");
    const form = createFormSubmission(keys());
    const submit = async (
      values: typeof parsed.data,
      context: FormSubmissionContext,
    ) => {
      await client.request("/api/v1/orgs/test", emptyResultSchema, {
        method: "PATCH",
        body: values,
        ...context,
      });
    };
    await expect(form.run(parsed.data, submit)).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(await form.run(parsed.data, submit)).toBe(true);
    expect(
      requests.map((request) =>
        new Headers(request.headers).get("Idempotency-Key"),
      ),
    ).toEqual(["key-1", "key-1"]);
    expect(
      requests.map((request) => JSON.parse(String(request.body)).version),
    ).toEqual([7, 7]);
  });
});

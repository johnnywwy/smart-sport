import { apiResponseSchema, fieldErrorsSchema } from "@smart-sport/contracts";
import { HttpResponse } from "msw/http";

export function mockResponse(
  status: number,
  code: number,
  message: string,
  data: unknown = null,
) {
  const envelope = apiResponseSchema.parse({
    code,
    message,
    data,
    traceId: crypto.randomUUID(),
  });
  return new HttpResponse(JSON.stringify(envelope), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Mock-Response": "true",
      "X-App-Version": __APP_VERSION__,
    },
  });
}

export function invalidMockRequest() {
  return mockResponse(
    400,
    90001,
    "参数校验失败",
    fieldErrorsSchema.parse({ fields: { _request: ["请求格式不正确"] } }),
  );
}

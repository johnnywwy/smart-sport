import type { IncomingMessage, ServerResponse } from "node:http";
import { CLS_ID, type ClsService } from "nestjs-cls";
import { v7 } from "uuid";

export function requestContextMiddleware(cls: ClsService) {
  return (
    request: IncomingMessage & { id?: string },
    response: ServerResponse,
    next: () => void,
  ) => {
    const traceId = v7();
    request.id = traceId;
    response.setHeader("X-Trace-Id", traceId);
    cls.runWith({ [CLS_ID]: traceId }, next);
  };
}

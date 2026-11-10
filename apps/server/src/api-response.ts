import type { IncomingMessage, ServerResponse } from "node:http";
import {
  type ArgumentsHost,
  type CallHandler,
  Catch,
  type ExceptionFilter,
  type ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  type NestInterceptor,
  SetMetadata,
  StreamableFile,
} from "@nestjs/common";
import { HttpAdapterHost, Reflector } from "@nestjs/core";
import { type SystemErrorCode, systemErrors } from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { map } from "rxjs";

const RAW_RESPONSE = Symbol("RAW_RESPONSE");
export const RawResponse = () => SetMetadata(RAW_RESPONSE, true);

export class ApiException extends HttpException {
  constructor(
    readonly code: SystemErrorCode,
    readonly data: unknown = null,
  ) {
    const { message, status } = systemErrors[code];
    super(message, status);
  }
}

/** Use for request validation failures. Only field paths are taken from issues. */
export function invalidRequest(
  issues: readonly { path: readonly PropertyKey[] }[],
) {
  const fields = Object.fromEntries(
    issues.map(({ path }) => [
      path.map(String).join(".") || "_request",
      ["格式或取值不符合要求"],
    ]),
  );
  return new ApiException(90001, { fields });
}

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  constructor(
    @Inject(ClsService) private readonly cls: ClsService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (
      this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return next.handle();
    }
    const response = context.switchToHttp().getResponse<ServerResponse>();
    const traceId = this.cls.getId();
    return next.handle().pipe(
      map((data: unknown) => {
        if (response.headersSent || data instanceof StreamableFile) return data;
        return { code: 0, message: "ok", data: data ?? null, traceId };
      }),
    );
  }
}

function errorBody(error: unknown, status: number) {
  if (error instanceof ApiException) {
    return {
      code: error.code,
      message: systemErrors[error.code].message,
      data: error.data,
    };
  }
  switch (status) {
    case 400:
      return {
        code: 90001,
        message: systemErrors[90001].message,
        data: { fields: { _request: ["请求格式不正确"] } },
      };
    case 401:
      return { code: 10005, message: "登录已过期，请重新登录", data: null };
    case 403:
      return { code: 11101, message: "缺少权限", data: null };
    case 404:
      return { code: 90004, message: systemErrors[90004].message, data: null };
    case 413:
      return { code: 90006, message: systemErrors[90006].message, data: null };
    case 429:
      return { code: 90005, message: systemErrors[90005].message, data: null };
    default:
      return { code: 90500, message: systemErrors[90500].message, data: null };
  }
}

@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}

  catch(error: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.adapterHost;
    const http = host.switchToHttp();
    const response = http.getResponse<ServerResponse>();
    if (httpAdapter.isHeadersSent(response)) {
      httpAdapter.end(response);
      return;
    }
    const request = http.getRequest<IncomingMessage & { id: string }>();
    const tooLarge =
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.too.large";
    const status =
      error instanceof HttpException ? error.getStatus() : tooLarge ? 413 : 500;
    httpAdapter.reply(
      response,
      {
        ...errorBody(error, status),
        traceId: this.cls.getId() ?? request.id,
      },
      status,
    );
  }
}

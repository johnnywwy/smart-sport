import type { IncomingMessage } from "node:http";
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

export const ACCESS_TOKEN_VERIFIER = Symbol("ACCESS_TOKEN_VERIFIER");
export type AccessTokenVerifier = {
  verify(token: string | undefined): Promise<unknown>;
};

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(
    @Inject(ACCESS_TOKEN_VERIFIER)
    private readonly tokens: AccessTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<IncomingMessage>();
    const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? "");
    if (!(await this.tokens.verify(match?.[1])))
      throw new UnauthorizedException();
    return true;
  }
}

import type { IncomingMessage } from "node:http";
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ClsService } from "nestjs-cls";

export type AuthenticatedClaims = {
  userId: string;
  sessionId: string;
  tokenVersion: number;
  stage: "account" | "identity";
  identityId?: string;
};

export type AuthenticatedRequest = IncomingMessage & {
  auth?: AuthenticatedClaims;
};

export const ACCESS_TOKEN_VERIFIER = Symbol("ACCESS_TOKEN_VERIFIER");
export type AccessTokenVerifier = {
  verify(token: string | undefined): Promise<AuthenticatedClaims | undefined>;
};

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(
    @Inject(ACCESS_TOKEN_VERIFIER)
    private readonly tokens: AccessTokenVerifier,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? "");
    const claims = await this.tokens.verify(match?.[1]);
    if (!claims) throw new UnauthorizedException();
    request.auth = claims;
    if (claims.identityId) this.cls.set("identityId", claims.identityId);
    return true;
  }
}

import type { IncomingMessage } from "node:http";
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ClsService } from "nestjs-cls";
import { AUTH_POLICY } from "./auth-policy.js";

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

export const AUTH_CONTEXT_LOADER = Symbol("AUTH_CONTEXT_LOADER");
export type AuthContextLoader = {
  authenticate(
    claims: AuthenticatedClaims,
  ): Promise<{ identityId: string } | undefined>;
};

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(
    @Inject(ACCESS_TOKEN_VERIFIER)
    private readonly tokens: AccessTokenVerifier,
    @Inject(ClsService) private readonly cls: ClsService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTH_CONTEXT_LOADER) private readonly contexts: AuthContextLoader,
  ) {}

  async canActivate(context: ExecutionContext) {
    const policy = this.reflector.getAllAndOverride<string>(AUTH_POLICY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (policy === "public") return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? "");
    const claims = await this.tokens.verify(match?.[1]);
    if (!claims) throw new UnauthorizedException();
    if (claims.stage === "account" && policy !== "account")
      throw new UnauthorizedException();
    const identity = await this.contexts.authenticate(claims);
    request.auth = claims;
    this.cls.set("userId", claims.userId);
    this.cls.set("sessionId", claims.sessionId);
    if (identity) {
      this.cls.set("identityId", identity.identityId);
      this.cls.set("identityContext", identity);
    }
    return true;
  }
}

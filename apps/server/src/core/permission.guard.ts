import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Optional,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type {
  DataScopeOption,
  DeclaredPermissionCode,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { ApiException } from "../api-response.js";

export const SCHOOL_SERVICE_POLICY = Symbol("SCHOOL_SERVICE_POLICY");
export type SchoolServicePolicy = {
  requireEntry(
    actor: Parameters<SchoolServicePolicy["ownError"]>[0],
  ): Promise<void>;
  ownError(
    actor: {
      orgId: string;
      orgType: string;
      identityType: import("@smart-sport/contracts").IdentityType;
      permissions: ReadonlyMap<string, DataScopeOption>;
    },
    permissions: DeclaredPermissionCode[],
    schoolId?: string,
  ): Promise<void>;
};
const REQUIRED_PERMISSIONS = Symbol("REQUIRED_PERMISSIONS");
const ANY_PERMISSIONS = Symbol("ANY_PERMISSIONS");
/** 多个权限为且关系；类与方法上的要求累加，方法不能取消类要求。 */
export const RequirePermissions = (
  ...permissions: [DeclaredPermissionCode, ...DeclaredPermissionCode[]]
) => SetMetadata(REQUIRED_PERMISSIONS, permissions);

/** 共享查询入口接受任一功能；Service 仍须校验请求所选的具体范围。 */
export const RequireAnyPermissions = (
  ...permissions: [DeclaredPermissionCode, ...DeclaredPermissionCode[]]
) => SetMetadata(ANY_PERMISSIONS, permissions);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ClsService) private readonly cls: ClsService,
    @Optional()
    @Inject(SCHOOL_SERVICE_POLICY)
    private readonly services?: SchoolServicePolicy,
  ) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndMerge<DeclaredPermissionCode[]>(
      REQUIRED_PERMISSIONS,
      [context.getClass(), context.getHandler()],
    );
    const alternatives = [context.getClass(), context.getHandler()]
      .map((target) =>
        this.reflector.get<DeclaredPermissionCode[]>(ANY_PERMISSIONS, target),
      )
      .filter((group) => group?.length);
    // 类和方法上的任一权限组仍逐组累加，不能覆盖类级要求。
    if (!required?.length && !alternatives.length) return true;
    const identity = this.cls.get<
      | {
          permissions: ReadonlyMap<string, DataScopeOption>;
          orgId: string;
          orgType: string;
          identityType: import("@smart-sport/contracts").IdentityType;
        }
      | undefined
    >("identityContext");
    if (
      !identity ||
      required?.some((permission) => !identity.permissions.has(permission)) ||
      alternatives.some(
        (group) =>
          !group.some((permission) => identity.permissions.has(permission)),
      )
    )
      throw new ApiException(11101);
    if (identity && this.services) {
      const schoolId = context
        .switchToHttp()
        .getRequest<{ params?: { schoolId?: string } }>().params?.schoolId;
      return this.checkService(
        identity,
        required ?? [],
        alternatives,
        schoolId,
      );
    }
    return true;
  }
  private async checkService(
    identity: Parameters<SchoolServicePolicy["ownError"]>[0],
    required: DeclaredPermissionCode[],
    alternatives: DeclaredPermissionCode[][],
    schoolId?: string,
  ) {
    if (!this.services) return true;
    await this.services.ownError(identity, required, schoolId);
    for (const group of alternatives) {
      const candidates = group.filter((code) => identity.permissions.has(code));
      let last: unknown;
      for (const code of candidates) {
        try {
          await this.services.ownError(identity, [code], schoolId);
          last = undefined;
          break;
        } catch (error) {
          if (
            !(error instanceof ApiException) ||
            ![13001, 13002, 13003].includes(error.code)
          )
            throw error;
          last = error;
        }
      }
      if (last) throw last;
    }
    return true;
  }
}

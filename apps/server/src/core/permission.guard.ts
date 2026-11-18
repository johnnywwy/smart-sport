import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type {
  DataScopeOption,
  DeclaredPermissionCode,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { ApiException } from "../api-response.js";

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
    return true;
  }
}

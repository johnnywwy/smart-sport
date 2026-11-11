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
/** 多个权限为且关系；类与方法上的要求累加，方法不能取消类要求。 */
export const RequirePermissions = (
  ...permissions: [DeclaredPermissionCode, ...DeclaredPermissionCode[]]
) => SetMetadata(REQUIRED_PERMISSIONS, permissions);

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
    // 门户、区划等登录即可用的接口仍由 AuthGuard 校验身份。
    if (!required?.length) return true;
    const identity = this.cls.get<
      | {
          permissions: ReadonlyMap<string, DataScopeOption>;
        }
      | undefined
    >("identityContext");
    if (
      !identity ||
      required.some((permission) => !identity.permissions.has(permission))
    )
      throw new ApiException(11101);
    return true;
  }
}

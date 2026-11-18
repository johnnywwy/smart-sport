import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import type { IdentityContext } from "../../platform/identity-context/index.js";
import { FileAccessService } from "./file-access.service.js";
@Injectable()
export class FileBoundaryGuard implements CanActivate {
  constructor(
    @Inject(FileAccessService) private readonly access: FileAccessService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<{ params: { schoolId?: string } }>();
    const result = await this.access.snapshot(
      this.cls.get<IdentityContext>("identityContext"),
      request.params.schoolId ?? null,
    );
    await this.access.current(result.revision);
    return true;
  }
}

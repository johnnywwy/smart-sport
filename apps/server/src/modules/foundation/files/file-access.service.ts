import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { idSchema } from "@smart-sport/contracts";
import { ApiException } from "../../../api-response.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../../platform/identity-context/index.js";
@Injectable()
export class FileAccessService {
  constructor(
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
  ) {}
  /** 暂存文件只属于上传身份；学校路径不能隐式推断或借文件ID切换学校。 */
  async snapshot(actor: IdentityContext, schoolId: string | null) {
    const snapshot = await this.contexts.loadSnapshot(
      actor.identityId,
      actor.client,
    );
    const fresh = snapshot.context;
    if (
      fresh.userId !== actor.userId ||
      fresh.tokenVersion !== actor.tokenVersion
    )
      throw new ApiException(10005);
    if (schoolId) {
      const parsed = idSchema.safeParse(schoolId);
      if (
        !parsed.success ||
        fresh.orgType !== "school" ||
        fresh.orgId !== parsed.data.toLowerCase()
      )
        throw new ApiException(90004);
    } else if (fresh.orgType === "school") throw new ApiException(90004);
    return snapshot;
  }
  async current(revision: string) {
    if (!(await this.contexts.isCurrent(revision)))
      throw new ServiceUnavailableException("身份权限正在变更，请重试");
  }
}

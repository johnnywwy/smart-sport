import { Inject, Injectable } from "@nestjs/common";
import {
  type MenuOverrideQuery,
  menuOverrideDefinitions,
  type UpdateMenuOverrides,
} from "@smart-sport/contracts";
import { ApiException } from "../../../api-response.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../identity-context/index.js";
import { managedMenus } from "./menu-management.mapper.js";
import { MenuManagementRepository } from "./menu-management.repository.js";

type Metadata = { traceId: string; ip: string; userAgent: string };
@Injectable()
export class MenuManagementService {
  constructor(
    @Inject(MenuManagementRepository)
    private readonly repository: MenuManagementRepository,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
  ) {}
  async list(input: MenuOverrideQuery, actor: IdentityContext) {
    this.authorize(actor, "system:menu:view");
    const keyword = input.keyword?.toLocaleLowerCase();
    const rows = managedMenus(await this.repository.rows(), actor)
      .filter(
        (row) =>
          row.module === input.module &&
          (!keyword || row.displayName.toLocaleLowerCase().includes(keyword)),
      )
      .sort(
        (a, b) =>
          a.groupSort - b.groupSort ||
          a.sort - b.sort ||
          a.key.localeCompare(b.key),
      );
    return {
      items: rows.slice(
        (input.page - 1) * input.pageSize,
        input.page * input.pageSize,
      ),
      total: rows.length,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
  async update(
    input: UpdateMenuOverrides,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    return this.repository.transaction(async (tx) => {
      await this.repository.lock(tx);
      const fresh = await this.contexts.load(actor.identityId, actor.client);
      if (
        fresh.userId !== actor.userId ||
        fresh.tokenVersion !== actor.tokenVersion
      )
        throw new ApiException(10005);
      this.authorize(fresh, "system:menu:update");
      const before = managedMenus(await this.repository.rows(tx), fresh);
      for (const change of input.items) {
        const row = before.find(
          (row) => row.module === change.module && row.key === change.key,
        );
        if (!row) throw new ApiException(90004);
        if (row.version !== change.version) throw new ApiException(90002);
      }
      for (const change of input.items) {
        const definition = menuOverrideDefinitions.find(
          (row) => row.module === change.module && row.key === change.key,
        );
        if (!definition) throw new ApiException(90004);
        for (const source of definition.sources)
          await this.repository.save(tx, source, change);
        await this.repository.audit(tx, {
          userId: fresh.userId,
          identityId: fresh.identityId,
          orgId: fresh.orgId,
          action: "system.menu.update",
          targetType: "menu",
          changes: {
            before: before.find(
              (row) => row.module === change.module && row.key === change.key,
            ),
            after: change,
          },
          ...metadata,
          createdAt: new Date(),
        });
      }
      const after = managedMenus(await this.repository.rows(tx), fresh);
      return input.items.map((change) =>
        after.find(
          (row) => row.module === change.module && row.key === change.key,
        ),
      );
    });
  }
  private authorize(
    actor: IdentityContext,
    permission: "system:menu:view" | "system:menu:update",
  ) {
    if (actor.identityType !== "company" || !actor.permissions.has(permission))
      throw new ApiException(11101);
  }
}

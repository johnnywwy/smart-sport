import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import {
  type CreateDictItem,
  type DictItemQuery,
  type DictTypeCode,
  dictDefinitions,
  dictTypesSchema,
  type UpdateDictItem,
} from "@smart-sport/contracts";
import { v7 } from "uuid";
import { ApiException } from "../../../api-response.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../identity-context/index.js";
import { dictItemResponse } from "./dicts.mapper.js";
import {
  type DictItemRow,
  DictsRepository,
  type DictTransaction,
} from "./dicts.repository.js";

type Metadata = { traceId: string; ip: string; userAgent: string };
type WritePermission =
  | "system:dict:create"
  | "system:dict:update"
  | "system:dict:delete";
@Injectable()
export class DictsService implements OnModuleInit {
  constructor(
    @Inject(DictsRepository) private readonly repository: DictsRepository,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
  ) {}
  onModuleInit() {
    return this.repository.initialize();
  }
  /** 登录全局下拉选项，仅返回当前启用项。 */
  options(typeCode: DictTypeCode) {
    return this.repository.options(typeCode);
  }
  types(actor: IdentityContext) {
    this.authorize(actor, "system:dict:view");
    return dictTypesSchema.parse(
      dictDefinitions.map((d) => ({
        code: d.code,
        name: d.name,
        isSystem: true,
        allowCustom: d.allowCustom,
        allowedActions:
          d.allowCustom && actor.permissions.has("system:dict:create")
            ? ["create"]
            : [],
      })),
    );
  }
  async list(
    typeCode: DictTypeCode,
    input: DictItemQuery,
    actor: IdentityContext,
  ) {
    this.authorize(actor, "system:dict:view");
    const result = await this.repository.list(typeCode, input);
    return {
      ...result,
      items: result.items.map((row) => dictItemResponse(row, actor)),
    };
  }
  async create(
    typeCode: DictTypeCode,
    input: CreateDictItem,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    return this.write(actor, "system:dict:create", async (tx, fresh) => {
      if (!dictDefinitions.find((d) => d.code === typeCode)?.allowCustom)
        throw new ApiException(30011);
      const row = await this.repository.create(
        tx,
        typeCode,
        input,
        `custom_${v7()}`,
        fresh.identityId,
      );
      await this.audit(tx, "dict.item.create", null, row, fresh, metadata);
      return dictItemResponse(row, fresh);
    });
  }
  async update(
    id: string,
    input: UpdateDictItem,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    return this.mutate(
      id,
      input.version,
      actor,
      "system:dict:update",
      async (tx, row, fresh) => {
        const saved = await this.repository.update(
          tx,
          row,
          input,
          fresh.identityId,
        );
        await this.audit(tx, "dict.item.update", row, saved, fresh, metadata);
        return dictItemResponse(saved, fresh);
      },
    );
  }
  async remove(
    id: string,
    version: number,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    return this.mutate(
      id,
      version,
      actor,
      "system:dict:delete",
      async (tx, row, fresh) => {
        if (row.usedAt) throw new ApiException(30012);
        const saved = await this.repository.remove(tx, row, fresh.identityId);
        await this.audit(tx, "dict.item.delete", row, saved, fresh, metadata);
        return null;
      },
    );
  }
  /** 业务写入必须复用同一个事务；锁住选项后记录首次使用，与业务一起提交或回滚。 */
  async use(typeCode: DictTypeCode, value: string, tx: DictTransaction) {
    const row = await this.repository.byValue(tx, typeCode, value, true);
    if (!row) throw new ApiException(90004);
    if (!row.enabled) throw new ApiException(30014);
    if (!row.usedAt) await this.repository.markUsed(tx, row);
    return { value: row.value, label: row.label };
  }
  /** 历史记录解析包括停用选项；不把下拉查询记为业务使用。 */
  async resolve(typeCode: DictTypeCode, value: string, tx: DictTransaction) {
    const row = await this.repository.byValue(tx, typeCode, value);
    if (!row) throw new ApiException(90004);
    return { value: row.value, label: row.label };
  }
  private mutate<T>(
    id: string,
    version: number,
    actor: IdentityContext,
    permission: WritePermission,
    action: (
      tx: DictTransaction,
      row: DictItemRow,
      fresh: IdentityContext,
    ) => Promise<T>,
  ) {
    return this.write(actor, permission, async (tx, fresh) => {
      const row = await this.repository.lockById(tx, id.toLowerCase());
      if (!row) throw new ApiException(90004);
      if (row.isSystem) throw new ApiException(30010);
      if (row.version !== version) throw new ApiException(90002);
      return action(tx, row, fresh);
    });
  }
  private async write<T>(
    actor: IdentityContext,
    permission: WritePermission,
    action: (tx: DictTransaction, fresh: IdentityContext) => Promise<T>,
  ) {
    try {
      return await this.repository.transaction(async (tx) => {
        await this.repository.lockPolicy(tx);
        const fresh = await this.contexts.load(actor.identityId, actor.client);
        if (
          fresh.userId !== actor.userId ||
          fresh.tokenVersion !== actor.tokenVersion
        )
          throw new ApiException(10005);
        this.authorize(fresh, permission);
        return action(tx, fresh);
      });
    } catch (error) {
      const cause = (
        error as { cause?: { code?: string; constraint?: string } }
      ).cause;
      if (
        cause?.code === "23505" &&
        cause.constraint === "dict_items_label_active_unique"
      )
        throw new ApiException(30013);
      throw error;
    }
  }
  private authorize(
    actor: IdentityContext,
    permission: WritePermission | "system:dict:view",
  ) {
    if (actor.identityType !== "company" || !actor.permissions.has(permission))
      throw new ApiException(11101);
  }
  private audit(
    tx: DictTransaction,
    action: string,
    before: DictItemRow | null,
    after: DictItemRow,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    const fields = (row: DictItemRow | null) =>
      row && {
        typeCode: row.typeCode,
        label: row.label,
        description: row.description,
        sort: row.sort,
        enabled: row.enabled,
        deletedAt: row.deletedAt,
      };
    return this.repository.audit(tx, {
      userId: actor.userId,
      identityId: actor.identityId,
      orgId: actor.orgId,
      action,
      targetType: "dict_item",
      targetId: after.id,
      changes: { before: fields(before), after: fields(after) },
      ...metadata,
      createdAt: new Date(),
    });
  }
}

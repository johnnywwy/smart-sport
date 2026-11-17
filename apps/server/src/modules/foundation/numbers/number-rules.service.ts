import { Inject, Injectable } from "@nestjs/common";
import {
  numberDefinitions,
  numberRuleSchema,
  type UpdateNumberRule,
} from "@smart-sport/contracts";
import { ApiException } from "../../../api-response.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../../platform/identity-context/index.js";
import { planNumber } from "./number-format.js";
import { type NumberRuleRow, NumbersRepository } from "./numbers.repository.js";

type Metadata = { traceId: string; ip: string; userAgent: string };
@Injectable()
export class NumberRulesService {
  constructor(
    @Inject(NumbersRepository) private readonly repository: NumbersRepository,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
  ) {}
  async list(actor: IdentityContext) {
    this.authorize(actor, "system:number:view");
    return (await this.repository.list()).map(({ rule, year, lastIssued }) =>
      this.response(rule, year, lastIssued, actor),
    );
  }
  async update(
    id: string,
    input: UpdateNumberRule,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    try {
      return await this.repository.transaction(async (tx) => {
        await this.repository.lockPolicy(tx);
        const row = await this.repository.lockById(tx, id.toLowerCase());
        const fresh = await this.contexts.load(actor.identityId, actor.client);
        if (
          fresh.userId !== actor.userId ||
          fresh.tokenVersion !== actor.tokenVersion
        )
          throw new ApiException(10005);
        this.authorize(fresh, "system:number:update");
        if (!row) throw new ApiException(90004);
        if (row.version !== input.version) throw new ApiException(90002);
        if (row.currentValue >= 10 ** input.digits)
          throw new ApiException(90001, {
            fields: { digits: ["流水号位数不足以容纳当前流水值"] },
          });
        const saved = await this.repository.configure(
          tx,
          row,
          input,
          fresh.identityId,
        );
        await this.repository.audit(tx, {
          userId: fresh.userId,
          identityId: fresh.identityId,
          orgId: fresh.orgId,
          action: "number.rule.update",
          targetType: "number_rule",
          targetId: row.id,
          changes: {
            prefix: [row.prefix, saved.prefix],
            digits: [row.digits, saved.digits],
            reset: [row.reset, saved.reset],
          },
          ...metadata,
          createdAt: new Date(),
        });
        const year = await this.repository.year(tx);
        return this.response(
          saved,
          year,
          await this.repository.issued(tx, saved.prefix, year),
          fresh,
        );
      });
    } catch (error) {
      const cause = (
        error as { cause?: { code?: string; constraint?: string } }
      ).cause;
      if (
        cause?.code === "23505" &&
        cause.constraint === "number_rules_prefix_active_unique"
      )
        throw new ApiException(30002);
      throw error;
    }
  }
  private authorize(
    actor: IdentityContext,
    permission: "system:number:view" | "system:number:update",
  ) {
    if (actor.identityType !== "company" || !actor.permissions.has(permission))
      throw new ApiException(11101);
  }
  private response(
    row: NumberRuleRow,
    year: number,
    issued: number,
    actor: IdentityContext,
  ) {
    const definition = numberDefinitions.find((d) => d.type === row.type);
    if (!definition) throw new Error("未知编号对象");
    return numberRuleSchema.parse({
      id: row.id,
      type: row.type,
      name: definition.name,
      prefix: row.prefix,
      digits: row.digits,
      reset: row.reset,
      year: row.year,
      currentValue: row.currentValue,
      nextNumber: planNumber(row, year, issued).no,
      version: row.version,
      allowedActions: actor.permissions.has("system:number:update")
        ? ["update"]
        : [],
    });
  }
}

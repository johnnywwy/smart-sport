import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { NumberType } from "@smart-sport/contracts";
import { ApiException } from "../../../api-response.js";
import { planNumber } from "./number-format.js";
import {
  NumbersRepository,
  type NumberTransaction,
} from "./numbers.repository.js";

@Injectable()
export class NumbersService implements OnModuleInit {
  constructor(
    @Inject(NumbersRepository) private readonly repository: NumbersRepository,
  ) {}
  onModuleInit() {
    return this.repository.initialize();
  }
  /** 必须传业务事务；业务回滚时计数和编号登记同时回滚，不提前向外发布编号。 */
  async next(type: NumberType, tx: NumberTransaction) {
    const row = await this.repository.lockByType(tx, type);
    if (!row) throw new ApiException(90004);
    const year = await this.repository.year(tx);
    const issued = await this.repository.issued(tx, row.prefix, year);
    const plan = planNumber(row, year, issued);
    if (plan.error) throw new ApiException(plan.error);
    const saved = await this.repository.advance(tx, row, plan.year, plan.value);
    if (!plan.no) throw new Error("取号缺少生成结果");
    await this.repository.register(tx, {
      ruleId: saved.id,
      prefix: saved.prefix,
      year: saved.year,
      value: saved.currentValue,
      no: plan.no,
    });
    return plan.no;
  }
}

import { Inject, Injectable } from "@nestjs/common";
import { dateSchema, idSchema } from "@smart-sport/contracts";
import {
  calendarDays,
  shanghaiDate,
  shanghaiInstant,
  subscriptionStatus,
} from "@smart-sport/domain";
import { z } from "zod";
import { ApiException } from "../../../api-response.js";
import { NumbersService } from "../../foundation/numbers/index.js";
import { OutboxService } from "../../foundation/outbox/index.js";
import { ParamsService } from "../params/index.js";
import { schoolAppResponse } from "./subscription.mapper.js";
import {
  SubscriptionRepository,
  type SubscriptionRow,
  type SubscriptionTransaction,
} from "./subscription.repository.js";

const initialSchema = z.strictObject({
  schoolId: idSchema,
  salesIdentityId: idSchema.nullable().default(null),
  serviceStart: dateSchema.optional(),
  serviceEnd: dateSchema.optional(),
  contractNo: z.string().trim().min(1).max(128).nullable().default(null),
  graceDays: z.int().min(0).max(365).optional(),
});
export type InitialSubscription = z.input<typeof initialSchema>;
@Injectable()
export class SubscriptionLifecycleService {
  constructor(
    @Inject(SubscriptionRepository)
    private readonly repository: SubscriptionRepository,
    @Inject(NumbersService) private readonly numbers: NumbersService,
    @Inject(ParamsService) private readonly params: ParamsService,
    @Inject(OutboxService) private readonly events: OutboxService,
  ) {}
  /** 仅供已授权开通流程调用；必须加入调用方事务，不提供跳过审批的HTTP写入口。 */
  async initialize(
    tx: SubscriptionTransaction,
    input: InitialSubscription,
    actorId: string,
  ) {
    const data = initialSchema.parse(input);
    idSchema.parse(actorId);
    await this.repository.lockPolicy(tx);
    if (!(await this.repository.school(data.schoolId, tx)))
      throw new ApiException(90004);
    if ((await this.repository.snapshot(data.schoolId, tx, true)).subscription)
      throw new ApiException(90002);
    if (
      data.salesIdentityId &&
      !(await this.repository.salesIdentity(data.salesIdentityId, tx))
    )
      throw new ApiException(90004);
    const today = shanghaiDate(new Date()),
      start = data.serviceStart ?? today;
    if (data.contractNo && (!data.serviceStart || !data.serviceEnd))
      throw new ApiException(90001, {
        fields: { serviceEnd: ["合同开通必须填写服务期"] },
      });
    const end =
      data.serviceEnd ??
      calendarDays(
        start,
        (await this.params.get("subscription.trial_days", tx)) - 1,
      );
    if (end < start)
      throw new ApiException(90001, {
        fields: { serviceEnd: ["结束日期不能早于开始日期"] },
      });
    const period = {
      serviceStart: shanghaiInstant(start),
      serviceEnd: shanghaiInstant(end),
      graceDays:
        data.graceDays ??
        (await this.params.get("subscription.grace_days", tx)),
      contractNo: data.contractNo,
    };
    const row = await this.repository.insert(tx, {
      schoolId: data.schoolId,
      no: await this.numbers.next("subscription", tx),
      ...period,
      status: subscriptionStatus(period, today),
      salesIdentityId: data.salesIdentityId,
      createdBy: actorId,
      updatedBy: actorId,
    });
    await this.repository.insertApps(
      tx,
      ["school", "org"].map((appCode) => ({
        schoolId: row.schoolId,
        appCode,
        startDate: period.serviceStart,
        endDate: period.serviceEnd,
        source: data.contractNo ? ("contract" as const) : ("trial" as const),
        createdBy: actorId,
        updatedBy: actorId,
      })),
    );
    await this.record(tx, row, null, "initialize", actorId);
    return row;
  }
  /** 多实例按权限屏障和服务行锁串行校验，重跑没有状态变化就不写历史或事件。 */
  async reconcileSchool(schoolId: string) {
    return this.repository.transaction(async (tx) => {
      await this.repository.lockPolicy(tx);
      if (!(await this.repository.school(schoolId, tx))) return false;
      const { subscription: row } = await this.repository.snapshot(
        schoolId,
        tx,
        true,
      );
      if (!row) return false;
      const status = subscriptionStatus(row, shanghaiDate(new Date()));
      if (status === row.status) return false;
      const updated = await this.repository.status(tx, row, status);
      if (!updated) throw new ApiException(90002);
      await this.record(tx, updated, row.status, "status_changed", null);
      return true;
    });
  }
  async reconcileAll(report: (schoolId: string) => void = () => {}) {
    let after: string | undefined,
      changed = 0,
      failed = 0;
    while (true) {
      const rows = await this.repository.batch(after, 100);
      if (!rows.length) break;
      for (const { schoolId } of rows) {
        try {
          if (await this.reconcileSchool(schoolId)) changed++;
        } catch {
          failed++;
          report(schoolId);
        }
      }
      after = rows.at(-1)?.schoolId;
    }
    return { changed, failed };
  }
  private async record(
    tx: SubscriptionTransaction,
    row: SubscriptionRow,
    previousStatus: SubscriptionRow["status"] | null,
    action: "initialize" | "status_changed",
    actorId: string | null,
  ) {
    const { apps } = await this.repository.snapshot(row.schoolId, tx);
    await this.repository.log(tx, {
      schoolId: row.schoolId,
      subscriptionId: row.id,
      action,
      previousStatus,
      status: row.status,
      serviceStart: row.serviceStart,
      serviceEnd: row.serviceEnd,
      graceDays: row.graceDays,
      apps: apps.map(schoolAppResponse),
      createdBy: actorId,
    });
    await this.repository.audit(tx, {
      identityId: actorId,
      schoolId: row.schoolId,
      action: `subscription.${action}`,
      targetType: "subscription",
      targetId: row.id,
      changes: { status: [previousStatus, row.status], version: row.version },
      createdAt: new Date(),
    });
    await this.events.append(
      tx,
      {
        topic: "subscription.changed",
        schoolId: row.schoolId,
        payload: { recordId: row.id, version: row.version },
      },
      actorId,
    );
  }
}

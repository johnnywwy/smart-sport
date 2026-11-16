import { Inject, Injectable } from "@nestjs/common";
import {
  type CreateSchoolProfile,
  createSchoolProfileSchema,
  schoolProfileSchema,
  type UpdateSchoolProfile,
} from "@smart-sport/contracts";
import { ApiException } from "../../../api-response.js";
import { MemberCredentials } from "../../../infra/crypto/member-credentials.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../identity-context/index.js";
import { SchoolProfilePolicy } from "./school-profile-policy.service.js";
import {
  type SchoolProfileRow,
  SchoolProfilesRepository,
  type SchoolProfileTransaction,
} from "./school-profiles.repository.js";

type Metadata = { traceId: string; ip: string; userAgent: string };
@Injectable()
export class SchoolProfilesService {
  constructor(
    @Inject(SchoolProfilesRepository)
    private readonly repository: SchoolProfilesRepository,
    @Inject(SchoolProfilePolicy) private readonly policy: SchoolProfilePolicy,
    @Inject(MemberCredentials) private readonly credentials: MemberCredentials,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
  ) {}
  authorize(schoolId: string, actor: IdentityContext, write: boolean) {
    const permission = write ? "school:profile:update" : "school:profile:view";
    return this.repository.transaction(async (tx) => {
      await this.repository.lockPolicy(tx, false);
      actor = await this.policy.actor(actor, permission);
      await this.policy.require(actor, schoolId, permission);
      await this.school(tx, schoolId);
    });
  }
  read(schoolId: string, actor: IdentityContext, metadata: Metadata) {
    schoolId = schoolId.toLowerCase();
    return this.repository.transaction(async (tx) => {
      await this.repository.lockPolicy(tx, false);
      actor = await this.policy.actor(actor, "school:profile:view");
      await this.policy.require(actor, schoolId, "school:profile:view");
      const school = await this.school(tx, schoolId);
      const row = await this.repository.find(tx, schoolId);
      if (!row) throw new ApiException(90004);
      const response = await this.response(row, school.name, actor);
      if (actor.identityType === "company")
        await this.audit(
          tx,
          actor,
          schoolId,
          "school.profile.view",
          {},
          metadata,
        );
      return response;
    });
  }
  async update(
    schoolId: string,
    input: UpdateSchoolProfile,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    schoolId = schoolId.toLowerCase();
    const result = await this.unique(async () =>
      this.repository.transaction(async (tx) => {
        await this.repository.lockPolicy(tx, true);
        actor = await this.policy.actor(actor, "school:profile:update");
        await this.policy.require(actor, schoolId, "school:profile:update");
        const school = await this.school(tx, schoolId);
        const current = await this.repository.find(tx, schoolId, true);
        if (!current) throw new ApiException(90004);
        if (current.version !== input.version) throw new ApiException(90002);
        // 外部输入已由路由契约校验；内部调用也不能绕过学段与年限约束。
        const { version: _version, ...data } = input;
        const parsed = createSchoolProfileSchema.safeParse({
          ...data,
          contactPhone: input.contactPhone ?? null,
        });
        if (!parsed.success) throw new ApiException(12006);
        const { contactPhone, ...fields } = parsed.data;
        const updated = await this.repository.update(
          tx,
          schoolId,
          input.version,
          {
            ...fields,
            ...(input.contactPhone !== undefined
              ? this.phone(contactPhone)
              : {}),
            updatedBy: actor.identityId,
          },
        );
        if (!updated) throw new ApiException(90002);
        await this.audit(
          tx,
          actor,
          schoolId,
          "school.profile.update",
          this.changes(current, updated, input.contactPhone !== undefined),
          metadata,
        );
        return this.response(updated, school.name, actor);
      }),
    );
    await this.contexts.invalidate();
    return result;
  }
  /** 只供开通流程在其创建组织的同一事务中调用；不暴露 HTTP 创建接口。 */
  async initialize(
    tx: SchoolProfileTransaction,
    schoolId: string,
    input: CreateSchoolProfile,
    actorId: string,
  ) {
    const parsed = createSchoolProfileSchema.safeParse(input);
    if (!parsed.success) throw new ApiException(12006);
    await this.repository.lockPolicy(tx, true);
    await this.school(tx, schoolId);
    const { contactPhone, ...fields } = parsed.data;
    return this.unique(() =>
      this.repository.insert(tx, {
        schoolId,
        ...fields,
        ...this.phone(contactPhone),
        createdBy: actorId,
        updatedBy: actorId,
      }),
    );
  }
  private async school(tx: SchoolProfileTransaction, id: string) {
    const school = await this.repository.school(tx, id);
    if (!school) throw new ApiException(90004);
    return school;
  }
  private phone(value: string | null) {
    return {
      contactPhone:
        value === null ? null : this.credentials.encryptPhone(value),
      contactPhoneHash:
        value === null ? null : this.credentials.phoneHash(value),
    };
  }
  private async response(
    row: SchoolProfileRow,
    schoolName: string,
    actor: IdentityContext,
  ) {
    return schoolProfileSchema.parse({
      schoolId: row.schoolId,
      schoolName,
      schoolCode: row.schoolCode,
      stages: row.stages,
      stageYears: row.stageYears,
      nature: row.nature,
      address: row.address,
      contactName: row.contactName,
      contactPhone: this.credentials.maskedContactPhone(row.contactPhone),
      version: row.version,
      allowedActions: (await this.policy.allows(
        actor,
        row.schoolId,
        "school:profile:update",
      ))
        ? ["update"]
        : [],
    });
  }
  private changes(
    before: SchoolProfileRow,
    after: SchoolProfileRow,
    phoneChanged: boolean,
  ) {
    const fields = [
      "schoolCode",
      "stages",
      "stageYears",
      "nature",
      "address",
      "contactName",
    ] as const;
    return {
      ...Object.fromEntries(
        fields
          .filter(
            (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
          )
          .map((key) => [key, [before[key], after[key]]]),
      ),
      ...(phoneChanged ? { contactPhone: "已修改" } : {}),
    };
  }
  private audit(
    tx: SchoolProfileTransaction,
    actor: IdentityContext,
    schoolId: string,
    action: string,
    changes: Record<string, unknown>,
    metadata: Metadata,
  ) {
    return this.repository.audit(tx, {
      userId: actor.userId,
      identityId: actor.identityId,
      orgId: actor.orgId,
      schoolId,
      action,
      targetType: "school_profile",
      targetId: schoolId,
      changes,
      ...metadata,
      createdAt: new Date(),
    });
  }
  private async unique<T>(write: () => Promise<T>) {
    try {
      return await write();
    } catch (error) {
      const cause = (error as { cause?: unknown }).cause ?? error;
      if (
        (cause as { code?: string }).code === "23505" &&
        (cause as { constraint?: string }).constraint ===
          "school_profiles_code_active_unique"
      )
        throw new ApiException(12005);
      throw error;
    }
  }
}

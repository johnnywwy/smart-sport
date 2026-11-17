import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateAcademicYear,
  UpdateSemester,
} from "@smart-sport/contracts";
import { ApiException } from "../../../api-response.js";
import {
  type IdentityContext,
  IdentityContextService,
} from "../identity-context/index.js";
import { academicYearsResponse } from "./academic.mapper.js";
import {
  AcademicRepository,
  type AcademicTransaction,
} from "./academic.repository.js";
import {
  academicDate,
  academicInstant,
  defaultAcademicYear,
  semesterDateError,
} from "./academic-calendar.js";

type Metadata = { traceId: string; ip: string; userAgent: string };
type WritePermission = "system:academic:create" | "system:academic:update";
@Injectable()
export class AcademicService {
  constructor(
    @Inject(AcademicRepository) private readonly repository: AcademicRepository,
    @Inject(IdentityContextService)
    private readonly contexts: IdentityContextService,
  ) {}
  /** 全平台日历对已选身份开放，写能力仍取真实权限。 */
  async list(actor: IdentityContext) {
    return academicYearsResponse(
      await this.repository.list(),
      actor.permissions.has("system:academic:update"),
    );
  }
  async current(actor: IdentityContext) {
    const academicYear = (await this.list(actor)).find((row) => row.isCurrent);
    return {
      academicYear: academicYear ?? null,
      semester: academicYear?.semesters.find((row) => row.isCurrent) ?? null,
    };
  }
  /** 一次事务创建学年和两个默认学期，不隐式修改当前标记。 */
  create(
    input: CreateAcademicYear,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    return this.write(actor, "system:academic:create", async (tx, fresh) => {
      const defaults = defaultAcademicYear(input.startYear);
      const rows = await this.repository.list(tx);
      if (
        rows.some(
          ({ year }) => academicDate(year.startDate) === defaults.startDate,
        )
      )
        throw new ApiException(20001);
      const year = await this.repository.insertYear(tx, {
        name: defaults.name,
        startDate: academicInstant(defaults.startDate),
        endDate: academicInstant(defaults.endDate),
        createdBy: fresh.identityId,
        updatedBy: fresh.identityId,
      });
      await this.repository.insertSemesters(
        tx,
        defaults.semesters.map((semester) => ({
          ...semester,
          startDate: academicInstant(semester.startDate),
          endDate: academicInstant(semester.endDate),
          academicYearId: year.id,
          createdBy: fresh.identityId,
          updatedBy: fresh.identityId,
        })),
      );
      await this.audit(
        tx,
        fresh,
        year.id,
        "academic.year.create",
        defaults,
        metadata,
      );
      return this.response(tx, year.id, fresh);
    });
  }
  /** 日期修改与切换共用日历锁，防止校验完成后所属学年被另一请求关闭。 */
  update(
    id: string,
    input: UpdateSemester,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    id = id.toLowerCase();
    return this.write(actor, "system:academic:update", async (tx, fresh) => {
      const rows = await this.repository.list(tx);
      const { year, semester } = this.target(rows, id, input.version);
      const other = rows.find(
        (row) => row.year.id === year.id && row.semester?.id !== id,
      )?.semester;
      if (!other) throw new Error("学年缺少另一个学期");
      const fields = semesterDateError(
        input,
        semester.term,
        {
          startDate: academicDate(year.startDate),
          endDate: academicDate(year.endDate),
        },
        {
          startDate: academicDate(other.startDate),
          endDate: academicDate(other.endDate),
        },
      );
      if (fields) throw new ApiException(90001, { fields });
      await this.repository.updateSemester(tx, semester, fresh.identityId, {
        startDate: academicInstant(input.startDate),
        endDate: academicInstant(input.endDate),
      });
      await this.audit(
        tx,
        fresh,
        id,
        "academic.semester.update",
        {
          startDate: [academicDate(semester.startDate), input.startDate],
          endDate: [academicDate(semester.endDate), input.endDate],
        },
        metadata,
      );
      const result = (await this.response(tx, year.id, fresh)).semesters.find(
        (s) => s.id === id,
      );
      if (!result) throw new Error("修改后缺少目标学期");
      return result;
    });
  }
  /** 先清除旧标记，再设置目标；关闭旧学年和递增关联版本均在同一事务提交。 */
  setCurrent(
    id: string,
    version: number,
    actor: IdentityContext,
    metadata: Metadata,
  ) {
    id = id.toLowerCase();
    return this.write(actor, "system:academic:update", async (tx, fresh) => {
      const rows = await this.repository.list(tx);
      const { year, semester } = this.target(rows, id, version);
      if (semester.isCurrent) return this.currentResponse(tx, fresh);
      const previous = rows.find((row) => row.semester?.isCurrent);
      if (previous?.semester)
        await this.repository.updateSemester(
          tx,
          previous.semester,
          fresh.identityId,
          {
            isCurrent: false,
          },
        );
      if (previous && previous.year.id !== year.id)
        await this.repository.updateYear(tx, previous.year, fresh.identityId, {
          isCurrent: false,
          status: "closed",
        });
      if (!year.isCurrent)
        await this.repository.updateYear(tx, year, fresh.identityId, {
          isCurrent: true,
          status: "current",
        });
      await this.repository.updateSemester(tx, semester, fresh.identityId, {
        isCurrent: true,
      });
      await this.audit(
        tx,
        fresh,
        id,
        "academic.semester.set_current",
        {
          academicYearId: [previous?.year.id ?? null, year.id],
          semesterId: [previous?.semester?.id ?? null, id],
          closedAcademicYearId:
            previous && previous.year.id !== year.id ? previous.year.id : null,
        },
        metadata,
      );
      return this.currentResponse(tx, fresh);
    });
  }
  private target(
    rows: Awaited<ReturnType<AcademicRepository["list"]>>,
    id: string,
    version: number,
  ) {
    const found = rows.find((row) => row.semester?.id === id.toLowerCase());
    if (!found?.semester) throw new ApiException(90004);
    if (found.year.status === "closed") throw new ApiException(20002);
    if (found.semester.version !== version) throw new ApiException(90002);
    return { year: found.year, semester: found.semester };
  }
  private async write<T>(
    actor: IdentityContext,
    permission: WritePermission,
    callback: (tx: AcademicTransaction, fresh: IdentityContext) => Promise<T>,
  ) {
    return this.repository.transaction(async (tx) => {
      await this.repository.lockPolicy(tx);
      await this.repository.lockCalendar(tx);
      const fresh = await this.contexts.load(actor.identityId, actor.client);
      if (
        fresh.userId !== actor.userId ||
        fresh.tokenVersion !== actor.tokenVersion
      )
        throw new ApiException(10005);
      if (!fresh.permissions.has(permission)) throw new ApiException(11101);
      return callback(tx, fresh);
    });
  }
  private async response(
    tx: AcademicTransaction,
    id: string,
    actor: IdentityContext,
  ) {
    const result = academicYearsResponse(
      await this.repository.list(tx),
      actor.permissions.has("system:academic:update"),
    ).find((row) => row.id === id);
    if (!result) throw new ApiException(90004);
    return result;
  }
  private async currentResponse(
    tx: AcademicTransaction,
    actor: IdentityContext,
  ) {
    const year = academicYearsResponse(
      await this.repository.list(tx),
      actor.permissions.has("system:academic:update"),
    ).find((row) => row.isCurrent);
    if (!year) throw new Error("切换后缺少当前学年");
    const semester = year.semesters.find((s) => s.isCurrent);
    if (!semester) throw new Error("切换后缺少当前学期");
    return {
      academicYear: year,
      semester,
    };
  }
  private audit(
    tx: AcademicTransaction,
    actor: IdentityContext,
    targetId: string,
    action: string,
    changes: Record<string, unknown>,
    metadata: Metadata,
  ) {
    return this.repository.audit(tx, {
      userId: actor.userId,
      identityId: actor.identityId,
      orgId: actor.orgId,
      action,
      targetType:
        action === "academic.year.create" ? "academic_year" : "semester",
      targetId,
      changes,
      ...metadata,
      createdAt: new Date(),
    });
  }
}

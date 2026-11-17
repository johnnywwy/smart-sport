import type {
  AcademicYear,
  CreateAcademicYear,
  UpdateSemester,
} from "@smart-sport/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";
import { ApiError } from "../../../../shared/errors/api-error";
import { useApiEvents } from "../../../../shared/stores/api-events";
import {
  academicCapabilitiesOptions,
  academicYearsOptions,
  createAcademicYear,
  saveSemester,
  selectCurrentSemester,
} from "./academic-requests";

export function useAcademicYears(identityId: string) {
  const options = academicYearsOptions(identityId);
  const years = useQuery(options);
  const capabilities = useQuery(academicCapabilitiesOptions(identityId));
  const client = useQueryClient();
  const changed = () => {
    void client.invalidateQueries({
      queryKey: [identityId, "current-academic"],
    });
  };
  const refresh = async () => {
    const result = await years.refetch();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("学年列表暂不可用");
    return result.data;
  };
  const updateYears = (update: (rows: AcademicYear[]) => AcademicYear[]) =>
    client.setQueryData<AcademicYear[]>(options.queryKey, (rows) =>
      update(rows ?? []),
    );
  return {
    years,
    capabilities,
    create: async (
      values: CreateAcademicYear,
      context: FormSubmissionContext,
    ) => {
      const row = await createAcademicYear(values, context);
      updateYears((rows) => [...rows.filter((r) => r.id !== row.id), row]);
      changed();
      useApiEvents.getState().notifySuccess(`已新建${row.name}。`);
    },
    save: async (
      id: string,
      values: UpdateSemester,
      context: FormSubmissionContext,
    ) => {
      const saved = await saveSemester(id, values, context);
      updateYears((rows) =>
        rows.map((year) =>
          year.id === saved.academicYearId
            ? {
                ...year,
                semesters: [
                  year.semesters[0].id === id ? saved : year.semesters[0],
                  year.semesters[1].id === id ? saved : year.semesters[1],
                ],
              }
            : year,
        ),
      );
      changed();
      useApiEvents.getState().notifySuccess("学期日期已保存。");
    },
    setCurrent: async (
      id: string,
      version: number,
      context: FormSubmissionContext,
    ) => {
      const result = await selectCurrentSemester(id, version, context);
      client.setQueryData([identityId, "current-academic"], result);
      // 切换会连带关闭旧学年并递增多个版本，重新读取真实列表，不自行推测这些版本。
      void client.invalidateQueries({ queryKey: options.queryKey });
      useApiEvents.getState().notifySuccess("当前学期已切换。");
    },
    reloadSemester: async (id: string) => {
      const row = (await refresh())
        .flatMap((year) => year.semesters)
        .find((s) => s.id === id);
      if (!row) throw new ApiError(404, 90004);
      return row;
    },
    retry: () => {
      void years.refetch();
      void capabilities.refetch();
    },
  };
}

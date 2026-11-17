import {
  academicYearOptionsSchema,
  academicYearSchema,
  type CreateAcademicYear,
  createAcademicYearSchema,
  currentAcademicSchema,
  semesterSchema,
  setCurrentSemesterSchema,
  type UpdateSemester,
  updateSemesterSchema,
} from "@smart-sport/contracts";
import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "../../../../shared/api/client";
import type { FormSubmissionContext } from "../../../../shared/components/schema-form/types";

export const academicCapabilitiesOptions = (identityId: string) =>
  queryOptions({
    queryKey: [identityId, "academic-options"],
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      apiClient.request(
        "/api/v1/academic-years/options",
        academicYearOptionsSchema,
        { signal, notify: false },
      ),
  });
export function createAcademicYear(
  values: CreateAcademicYear,
  context: FormSubmissionContext,
) {
  return apiClient.request("/api/v1/academic-years", academicYearSchema, {
    method: "POST",
    body: createAcademicYearSchema.parse(values),
    ...context,
  });
}
export function saveSemester(
  id: string,
  values: UpdateSemester,
  context: FormSubmissionContext,
) {
  return apiClient.request(`/api/v1/semesters/${id}`, semesterSchema, {
    method: "PATCH",
    body: updateSemesterSchema.parse(values),
    ...context,
  });
}
export function selectCurrentSemester(
  id: string,
  version: number,
  context: FormSubmissionContext,
) {
  return apiClient.request(
    `/api/v1/semesters/${id}/set-current`,
    currentAcademicSchema,
    {
      method: "POST",
      body: setCurrentSemesterSchema.parse({ version }),
      ...context,
    },
  );
}

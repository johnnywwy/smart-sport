import {
  type AcademicYear,
  type Semester,
  type UpdateSemester,
  updateSemesterSchema,
} from "@smart-sport/contracts";
import { FormDialog } from "../../../../../shared/components/form-dialog/FormDialog";
import type { FormSubmissionContext } from "../../../../../shared/components/schema-form/types";
import { semesterValues } from "../../academic-state";

export function EditSemesterDialog({
  identityId,
  year,
  semester,
  onClose,
  onSave,
  onReload,
}: {
  identityId: string;
  year: AcademicYear;
  semester: Semester;
  onClose: () => void;
  onSave: (
    values: UpdateSemester,
    context: FormSubmissionContext,
  ) => Promise<void>;
  onReload: () => Promise<Semester>;
}) {
  return (
    <FormDialog
      title={`编辑学年 · ${year.name}`}
      description={`正在编辑${semester.name}，带 * 的是必填项`}
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      scopeKey={`${identityId}:${semester.id}:dates`}
      schema={updateSemesterSchema}
      initialValues={semesterValues(semester)}
      version={semester.version}
      disabled={!semester.allowedActions.includes("update")}
      columns={2}
      fields={[
        { name: "startDate", label: "开始日期", type: "date" },
        { name: "endDate", label: "结束日期", type: "date" },
      ]}
      rule={`日期须在 ${year.startDate} 至 ${year.endDate} 之间，两个学期不能重叠。保存后立即生效，修改将记入操作记录。`}
      submitLabel="保存"
      onSubmit={onSave}
      onReload={async () => {
        const row = await onReload();
        return { values: semesterValues(row), version: row.version };
      }}
    />
  );
}

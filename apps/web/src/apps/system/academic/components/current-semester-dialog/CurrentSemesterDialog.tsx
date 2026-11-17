import {
  type AcademicYear,
  type Semester,
  setCurrentSemesterSchema,
} from "@smart-sport/contracts";
import { FormDialog } from "../../../../../shared/components/form-dialog/FormDialog";
import type { FormSubmissionContext } from "../../../../../shared/components/schema-form/types";
import { SemesterSummary } from "../semester-summary/SemesterSummary";
import "./CurrentSemesterDialog.css";

export function CurrentSemesterDialog({
  identityId,
  year,
  semester,
  currentYear,
  onClose,
  onSave,
  onReload,
}: {
  identityId: string;
  year: AcademicYear;
  semester: Semester;
  currentYear: AcademicYear | undefined;
  onClose: () => void;
  onSave: (version: number, context: FormSubmissionContext) => Promise<void>;
  onReload: () => Promise<Semester>;
}) {
  const closing = currentYear && currentYear.id !== year.id;
  return (
    <FormDialog
      title="设为当前学期"
      description={`${year.name} · ${semester.name}`}
      dialogClassName={`academic-current-dialog${closing ? " academic-current-danger" : ""}`}
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      scopeKey={`${identityId}:${semester.id}:current`}
      schema={setCurrentSemesterSchema}
      fields={[]}
      version={semester.version}
      disabled={!semester.allowedActions.includes("set-current")}
      submitLabel="确认设为当前"
      onSubmit={(values, context) => onSave(values.version, context)}
      onReload={async () => {
        const row = await onReload();
        return { values: {}, version: row.version };
      }}
    >
      <SemesterSummary semesters={[semester]} />
      {closing ? (
        <p className="academic-current-warning">
          确认后，{currentYear.name}
          将关闭，历史学期日期只能查看，也不能重新设为当前。
        </p>
      ) : (
        <p className="academic-current-description">
          确认后，全平台当前学期将切换为{semester.name}。
        </p>
      )}
      <p className="academic-current-description">
        此操作只切换平台日历，不会自动为学校办理升年级或毕业。
      </p>
    </FormDialog>
  );
}

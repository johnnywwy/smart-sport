import { Chip } from "@heroui/react";
import {
  type CreateAcademicYear,
  createAcademicYearSchema,
} from "@smart-sport/contracts";
import { FormDialog } from "../../../../../shared/components/form-dialog/FormDialog";
import type { FormSubmissionContext } from "../../../../../shared/components/schema-form/types";
import { academicPlan } from "../../academic-state";
import { SemesterSummary } from "../semester-summary/SemesterSummary";
import "./CreateYearDialog.css";

export function CreateYearDialog({
  identityId,
  startYear,
  onClose,
  onSave,
}: {
  identityId: string;
  startYear: number;
  onClose: () => void;
  onSave: (
    values: CreateAcademicYear,
    context: FormSubmissionContext,
  ) => Promise<void>;
}) {
  return (
    <FormDialog
      title="新建学年"
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      scopeKey={`${identityId}:create-academic-year`}
      schema={createAcademicYearSchema}
      initialValues={{ startYear }}
      fields={[
        {
          name: "startYear",
          label: "学年起始年份",
          type: "number",
          placeholder: "例如 2027",
          validationMessage: "请输入1至9998之间的整数年份",
        },
      ]}
      submitLabel="保存"
      rule="保存后自动生成两个学期，初始状态为未开始。日期可以分别调整；设置当前学期需另行确认。"
      onSubmit={onSave}
    >
      {({ values }) => {
        const plan = academicPlan(values.startYear);
        return (
          <div className="academic-create-plan" aria-live="polite">
            <div>
              <strong>{plan?.name ?? "请填写学年起始年份"}</strong>
              <Chip size="sm" variant="soft">
                未开始
              </Chip>
            </div>
            {plan && <SemesterSummary semesters={plan.semesters} />}
          </div>
        );
      }}
    </FormDialog>
  );
}

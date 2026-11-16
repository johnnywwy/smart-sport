import type { SetIdentityScopes } from "@smart-sport/contracts";
import type { ReactNode } from "react";
import { FormDialog } from "../../../../../shared/components/form-dialog/FormDialog";
import type { FormSubmissionContext } from "../../../../../shared/components/schema-form/types";
import { ScopePicker } from "../../../../../shared/components/scope-picker/ScopePicker";
import type { ScopeCandidates } from "../../../../../shared/components/scope-picker/types";
import type { ScopeDetails } from "../../hooks/use-scope-details";
import { scopeFormSchema, scopeSelections } from "../../scope-state";
import "./ScopeEditor.css";
export function ScopeEditor({
  targetName,
  details,
  candidates,
  onSave,
  onReload,
  onClose,
  renderPreview,
}: {
  targetName: string;
  details: ScopeDetails;
  candidates: ScopeCandidates;
  onSave: (
    input: SetIdentityScopes,
    context: FormSubmissionContext,
  ) => Promise<void>;
  onReload: () => Promise<ScopeDetails>;
  onClose: () => void;
  renderPreview: (value: ReturnType<typeof scopeSelections>) => ReactNode;
}) {
  return (
    <FormDialog
      isOpen
      dialogClassName="scope-editor-dialog"
      title={`编辑负责范围 · ${targetName}`}
      description="可选择区域或学校；区域会包含其下级启用学校。"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      schema={scopeFormSchema}
      version={details.version}
      scopeKey={
        "departmentId" in details ? details.departmentId : details.identityId
      }
      initialValues={{ scopes: details.scopes }}
      fields={[
        {
          name: "scopes",
          label: "负责的区域与学校",
          type: "custom",
          required: false,
          render: ({ value, disabled, onChange }) => (
            <ScopePicker
              value={scopeSelections(value)}
              candidates={candidates}
              disabled={disabled}
              onChange={onChange}
            />
          ),
        },
      ]}
      submitLabel="保存"
      onSubmit={onSave}
      onReload={async () => {
        const fresh = await onReload();
        return { values: { scopes: fresh.scopes }, version: fresh.version };
      }}
    >
      {({ values }) => renderPreview(scopeSelections(values.scopes))}
    </FormDialog>
  );
}

import {
  type CreateDictItem,
  createDictItemSchema,
} from "@smart-sport/contracts";
import { FormDialog } from "../../../../../shared/components/form-dialog/FormDialog";
import type { FormSubmissionContext } from "../../../../../shared/components/schema-form/types";
import { type DictType, dictItemValues } from "../../dict-state";
import { DictItemTypeField } from "./DictItemTypeField";
import { dictItemFields, dictItemRule } from "./dict-item-fields";
import "./DictItemDialog.css";
export function CreateDictItemDialog({
  identityId,
  type,
  onClose,
  onSave,
}: {
  identityId: string;
  type: DictType;
  onClose: () => void;
  onSave: (
    values: CreateDictItem,
    context: FormSubmissionContext,
  ) => Promise<void>;
}) {
  return (
    <FormDialog
      title="新增选项"
      dialogClassName="dict-item-dialog"
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      scopeKey={`${identityId}:${type.code}:create`}
      schema={createDictItemSchema}
      initialValues={dictItemValues()}
      disabled={!type.allowCustom || !type.allowedActions.includes("create")}
      fields={dictItemFields}
      beforeFields={<DictItemTypeField name={type.name} />}
      columns={2}
      rule={dictItemRule}
      submitLabel="保存"
      onSubmit={onSave}
    />
  );
}

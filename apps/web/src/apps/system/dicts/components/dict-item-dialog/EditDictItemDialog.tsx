import {
  type DictItem,
  type UpdateDictItem,
  updateDictItemSchema,
} from "@smart-sport/contracts";
import { useState } from "react";
import { FormDialog } from "../../../../../shared/components/form-dialog/FormDialog";
import type { FormSubmissionContext } from "../../../../../shared/components/schema-form/types";
import { dictItemValues } from "../../dict-state";
import { DictItemTypeField } from "./DictItemTypeField";
import { dictItemFields, dictItemRule } from "./dict-item-fields";
import "./DictItemDialog.css";
export function EditDictItemDialog({
  identityId,
  typeName,
  row,
  onClose,
  onSave,
  onReload,
}: {
  identityId: string;
  typeName: string;
  row: DictItem;
  onClose: () => void;
  onSave: (
    values: UpdateDictItem,
    context: FormSubmissionContext,
  ) => Promise<void>;
  onReload: () => Promise<DictItem>;
}) {
  const [loaded, setLoaded] = useState(row);
  return (
    <FormDialog
      title={`编辑选项 · ${row.label}`}
      dialogClassName="dict-item-dialog"
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      scopeKey={`${identityId}:${row.id}`}
      schema={updateDictItemSchema}
      initialValues={dictItemValues(row)}
      version={row.version}
      disabled={loaded.isSystem || !loaded.allowedActions.includes("update")}
      fields={dictItemFields}
      beforeFields={<DictItemTypeField name={typeName} />}
      columns={2}
      rule={dictItemRule}
      submitLabel="保存"
      onSubmit={onSave}
      onReload={async () => {
        const current = await onReload();
        setLoaded(current);
        return { values: dictItemValues(current), version: current.version };
      }}
    />
  );
}

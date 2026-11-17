import { type DictItem, deleteDictItemSchema } from "@smart-sport/contracts";
import { useState } from "react";
import { FormDialog } from "../../../../../shared/components/form-dialog/FormDialog";
import type { FormSubmissionContext } from "../../../../../shared/components/schema-form/types";
import "./DeleteDictItemDialog.css";
export function DeleteDictItemDialog({
  identityId,
  row,
  onClose,
  onDelete,
  onReload,
}: {
  identityId: string;
  row: DictItem;
  onClose: () => void;
  onDelete: (version: number, context: FormSubmissionContext) => Promise<void>;
  onReload: () => Promise<DictItem>;
}) {
  const [loaded, setLoaded] = useState(row);
  return (
    <FormDialog
      title={`删除选项“${loaded.label}”？`}
      description="请确认要删除的选项"
      dialogClassName="dict-delete-dialog"
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      scopeKey={`${identityId}:${row.id}:delete`}
      schema={deleteDictItemSchema}
      initialValues={{}}
      version={row.version}
      fields={[]}
      disabled={loaded.isSystem || !loaded.allowedActions.includes("delete")}
      rule={
        loaded.used
          ? "此选项已被使用，只能停用，不能删除。"
          : "删除后，该选项将从当前字典移除。系统内置或已使用过的选项不能删除。"
      }
      submitLabel="确认删除"
      onSubmit={(values, context) => onDelete(values.version, context)}
      onReload={async () => {
        const current = await onReload();
        setLoaded(current);
        return { values: {}, version: current.version };
      }}
    />
  );
}

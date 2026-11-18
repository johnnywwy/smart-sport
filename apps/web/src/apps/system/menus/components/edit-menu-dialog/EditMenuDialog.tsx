import type { MenuOverride, MenuOverrideFields } from "@smart-sport/contracts";
import { useState } from "react";
import { FormDialog } from "../../../../../shared/components/form-dialog/FormDialog";
import type { FormSubmissionContext } from "../../../../../shared/components/schema-form/types";
import { menuFormSchema, menuValues } from "../../menu-state";
import { MenuGroupField } from "../menu-group-field/MenuGroupField";
import "./EditMenuDialog.css";
export function EditMenuDialog({
  identityId,
  row,
  onClose,
  onSave,
  onReload,
}: {
  identityId: string;
  row: MenuOverride;
  onClose: () => void;
  onSave: (
    values: MenuOverrideFields,
    context: FormSubmissionContext,
  ) => Promise<void>;
  onReload: () => Promise<MenuOverride>;
}) {
  const [loaded, setLoaded] = useState(row);
  return (
    <FormDialog
      title={`修改菜单 · ${row.displayName}`}
      dialogClassName="edit-menu-dialog"
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      scopeKey={`${identityId}:${row.id}`}
      schema={menuFormSchema}
      initialValues={menuValues(row)}
      version={row.version}
      disabled={!loaded.allowedActions.includes("update")}
      columns={2}
      fields={[
        {
          name: "displayName",
          label: "显示名称",
          required: true,
          placeholder: "请输入显示名称",
          validationMessage: "请填写显示名称，最多 64 字",
        },
        {
          name: "sort",
          label: "顺序",
          type: "number",
          required: true,
          description: "同一分组内按从小到大排列",
          validationMessage: "请填写 0～1000000 的整数",
        },
        {
          name: "hidden",
          label: "是否显示",
          type: "select",
          options: [
            { value: false, label: "显示" },
            { value: true, label: "隐藏" },
          ],
        },
      ]}
      rule="这里只调整菜单的显示名称、顺序和是否显示；角色权限不变。隐藏后所有身份的侧栏都不再显示此菜单。"
      submitLabel="保存"
      onSubmit={onSave}
      onReload={async () => {
        const current = await onReload();
        setLoaded(current);
        return { values: menuValues(current), version: current.version };
      }}
    >
      <MenuGroupField name={loaded.groupName} />
    </FormDialog>
  );
}

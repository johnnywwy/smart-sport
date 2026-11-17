import type { SystemParam, UpdateSystemParam } from "@smart-sport/contracts";
import { useState } from "react";
import { FormDialog } from "../../../../../shared/components/form-dialog/FormDialog";
import type { FormSubmissionContext } from "../../../../../shared/components/schema-form/types";
import {
  paramDescription,
  paramFormSchema,
  paramValues,
} from "../../param-state";
import { ParamCurrentValue } from "../param-current-value/ParamCurrentValue";
import "./EditParamDialog.css";
export function EditParamDialog({
  identityId,
  row,
  onClose,
  onSave,
  onReload,
}: {
  identityId: string;
  row: SystemParam;
  onClose: () => void;
  onSave: (
    values: UpdateSystemParam,
    context: FormSubmissionContext,
  ) => Promise<void>;
  onReload: () => Promise<SystemParam>;
}) {
  const [loaded, setLoaded] = useState(row);
  return (
    <FormDialog
      title={`修改参数 · ${row.name}`}
      dialogClassName="system-param-dialog"
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      scopeKey={`${identityId}:${row.id}`}
      schema={paramFormSchema(loaded)}
      initialValues={paramValues(row)}
      version={row.version}
      disabled={!loaded.allowedActions.includes("update")}
      columns={2}
      beforeFields={<ParamCurrentValue row={loaded} />}
      fields={[
        {
          name: "value",
          label: `新的值（${loaded.unit}）`,
          type: "number",
          placeholder: "请输入新的值",
          description: `${loaded.min}～${loaded.max} 的整数${loaded.key === "password.expire_days" ? "，0 表示不过期" : loaded.key === "subscription.grace_days" ? "，0 表示无宽限期" : ""}`,
          validationMessage: `请填写 ${loaded.min}～${loaded.max} 的整数`,
        },
        {
          name: "reason",
          label: "修改原因",
          type: "textarea",
          fullWidth: true,
          placeholder: "例如：按安全要求收紧",
          description: "请说明本次调整的原因，最多 500 字。",
          validationMessage: "请填写修改原因，最多 500 字",
        },
      ]}
      rule={`此设置作用于全平台，请确认后保存；修改会记入平台操作记录。${paramDescription(loaded)}`}
      submitLabel="保存"
      onSubmit={onSave}
      onReload={async () => {
        const current = await onReload();
        setLoaded(current);
        return { values: paramValues(current), version: current.version };
      }}
    />
  );
}

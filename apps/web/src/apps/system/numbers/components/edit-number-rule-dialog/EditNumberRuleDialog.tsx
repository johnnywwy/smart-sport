import { Description, Label } from "@heroui/react";
import {
  type NumberRule,
  type UpdateNumberRule,
  updateNumberRuleSchema,
} from "@smart-sport/contracts";
import { useState } from "react";
import { FormDialog } from "../../../../../shared/components/form-dialog/FormDialog";
import type { FormSubmissionContext } from "../../../../../shared/components/schema-form/types";
import { numberRuleValues } from "../../number-state";
import "./EditNumberRuleDialog.css";

export function EditNumberRuleDialog({
  identityId,
  row,
  onClose,
  onSave,
  onReload,
}: {
  identityId: string;
  row: NumberRule;
  onClose: () => void;
  onSave: (
    values: UpdateNumberRule,
    context: FormSubmissionContext,
  ) => Promise<void>;
  onReload: () => Promise<NumberRule>;
}) {
  const [loaded, setLoaded] = useState(row);
  return (
    <FormDialog
      title={`修改编号规则 · ${row.name}`}
      dialogClassName="number-rule-dialog"
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      scopeKey={`${identityId}:${row.id}`}
      schema={updateNumberRuleSchema}
      initialValues={numberRuleValues(row)}
      version={row.version}
      disabled={!loaded.allowedActions.includes("update")}
      columns={2}
      fields={[
        {
          name: "prefix",
          label: "前缀",
          placeholder: "请输入前缀",
          description: "1至12位大写字母或数字，以字母开头",
        },
        {
          name: "digits",
          label: "流水号位数",
          type: "number",
          description: "1至12位",
        },
        {
          name: "reset",
          label: "重置周期",
          type: "select",
          options: [
            { value: "yearly", label: "每年" },
            { value: "never", label: "不重置" },
          ],
        },
      ]}
      rule="只影响之后新生成的编号，已有的编号不变。"
      submitLabel="保存"
      onSubmit={onSave}
      onReload={async () => {
        const saved = await onReload();
        setLoaded(saved);
        return {
          values: numberRuleValues(saved),
          version: saved.version,
        };
      }}
    >
      <div className="number-rule-preview">
        <Label>下一个编号</Label>
        <div className="number-rule-next" aria-live="polite">
          {loaded.nextNumber ?? "暂不可生成"}
        </div>
        <Description>
          当前已保存规则的预览，保存后更新，不占用编号。
        </Description>
      </div>
    </FormDialog>
  );
}

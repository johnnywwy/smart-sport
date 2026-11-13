import type { CreateRole, RoleDetail } from "@smart-sport/contracts";
import { FormDialog } from "../../../../../shared/components/form-dialog/FormDialog";
import type { FormSubmissionContext } from "../../../../../shared/components/schema-form/types";
import { createRoleFormSchema } from "../../role-state";

export function CreateRoleDialog({
  open,
  bases,
  selected,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  bases: RoleDetail[];
  selected: string | undefined;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    values: CreateRole,
    context: FormSubmissionContext,
  ) => Promise<void>;
}) {
  const initial = bases.find((role) => role.id === selected) ?? bases[0];
  return (
    <FormDialog
      title="新建角色"
      isOpen={open}
      onOpenChange={onOpenChange}
      schema={createRoleFormSchema(bases)}
      scopeKey="new-organization-role"
      fields={[
        { name: "name", label: "角色名称", placeholder: "请输入角色名称" },
        {
          name: "baseRoleId",
          label: "基于哪个角色",
          type: "select",
          options: bases.map((role) => ({ value: role.id, label: role.name })),
        },
      ]}
      initialValues={{ name: "", baseRoleId: initial?.id ?? "" }}
      submitLabel="新建"
      onSubmit={onSubmit}
      rule="新角色先沿用所选角色的权限，再在右侧调整。分给别人的权限不能超过你自己拥有的。"
    />
  );
}

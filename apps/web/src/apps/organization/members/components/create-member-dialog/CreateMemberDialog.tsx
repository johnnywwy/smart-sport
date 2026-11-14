import { Tabs } from "@heroui/react";
import type {
  createMemberResponseSchema,
  IdentitySummary,
  MemberOptions,
} from "@smart-sport/contracts";
import { useState } from "react";
import { FormDialog } from "../../../../../shared/components/form-dialog/FormDialog";
import type {
  FormField,
  FormSubmissionContext,
} from "../../../../../shared/components/schema-form/types";
import type { MembersData } from "../../hooks/use-members";
import {
  createMemberBody,
  type NewMemberDraft,
  newMemberFormSchema,
} from "../../member-state";
import { MemberDepartmentPicker } from "../member-department-picker/MemberDepartmentPicker";
import { MemberRolePicker } from "../member-role-picker/MemberRolePicker";
import "./CreateMemberDialog.css";
export function CreateMemberDialog({
  identity,
  options,
  onClose,
  onCreate,
  onCreated,
}: {
  identity: IdentitySummary;
  options: MemberOptions;
  onClose: () => void;
  onCreate: MembersData["create"];
  onCreated: (
    result: ReturnType<typeof createMemberResponseSchema.parse>,
  ) => void;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [busy, setBusy] = useState(false);
  const fields: FormField[] = [
    ...(mode === "new"
      ? [
          { name: "username", label: "登录账号", required: true },
          { name: "realName", label: "姓名", required: true },
          {
            name: "phone",
            label: "手机号",
            required: false,
            type: "tel" as const,
          },
          {
            name: "email",
            label: "邮箱",
            required: false,
            type: "email" as const,
          },
        ]
      : [
          {
            name: "account",
            label: "已有账号",
            required: true,
            placeholder: "用户名、手机号或邮箱",
            fullWidth: true,
          },
        ]),
    {
      name: "departmentId",
      required: false,
      label: "所在部门",
      type: "custom",
      render: ({ value, disabled, onChange }) => (
        <MemberDepartmentPicker
          items={options.departments}
          value={typeof value === "string" ? value : null}
          disabled={disabled}
          onChange={onChange}
        />
      ),
    },
    {
      name: "title",
      label: "职务",
      required: false,
      placeholder: "请输入职务",
    },
    {
      name: "roleIds",
      required: false,
      label: "角色（可以多选）",
      type: "custom",
      fullWidth: true,
      render: ({ value, disabled, onChange }) => (
        <MemberRolePicker
          roles={options.roles.filter(
            (role) => role.identityType === identity.type,
          )}
          selected={Array.isArray(value) ? value : []}
          disabled={disabled}
          onChange={onChange}
        />
      ),
    },
  ];
  return (
    <FormDialog
      title="新增成员"
      beforeFields={
        <Tabs
          className="create-member-mode"
          aria-label="新增方式"
          selectedKey={mode}
          onSelectionChange={(key) => {
            if (!busy) setMode(key as "new" | "existing");
          }}
          isDisabled={busy}
        >
          <Tabs.List>
            <Tabs.Tab id="new">
              新建账号
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="existing">
              已有账号追加身份
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      }
      description="为本组织新建账号，或给已有账号追加本组织身份。"
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      schema={newMemberFormSchema}
      scopeKey={mode}
      fields={fields}
      columns={2}
      initialValues={{ mode, departmentId: null, roleIds: [], title: null }}
      submitLabel={mode === "new" ? "创建成员" : "追加身份"}
      onSubmit={async (
        value: NewMemberDraft,
        context: FormSubmissionContext,
      ) => {
        setBusy(true);
        try {
          onCreated(await onCreate(createMemberBody(value), context));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="create-member-hint">
        {mode === "new"
          ? "新账号首次登录必须修改密码。初始密码仅在创建成功后展示一次。"
          : "只新增本组织身份，不修改已有账号的姓名、密码和其他组织身份。"}
      </p>
    </FormDialog>
  );
}

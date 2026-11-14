import { Chip } from "@heroui/react";
import type {
  MemberOptions,
  memberDetailSchema,
  UpdateMember,
} from "@smart-sport/contracts";
import { SchemaForm } from "../../../../../shared/components/schema-form/SchemaForm";
import type { FormSubmissionContext } from "../../../../../shared/components/schema-form/types";
import { editMemberFormSchema, memberValues } from "../../member-state";
import { MemberDepartmentPicker } from "../member-department-picker/MemberDepartmentPicker";
import { MemberPreview } from "../member-preview/MemberPreview";
import { MemberRolePicker } from "../member-role-picker/MemberRolePicker";
import "./MemberEditor.css";

type Detail = ReturnType<typeof memberDetailSchema.parse>;
export function MemberEditor({
  row,
  options,
  onSave,
  onReload,
  onClose,
  onPendingChange,
}: {
  row: Detail;
  options: MemberOptions;
  onSave: (
    value: UpdateMember,
    context: FormSubmissionContext,
  ) => Promise<void>;
  onReload: () => Promise<Detail>;
  onClose: () => void;
  onPendingChange: (busy: boolean) => void;
}) {
  const editable = row.allowedActions.includes("update");
  const assign = row.allowedActions.includes("assignRoles");
  const roles = options.roles.filter(
    (role) => role.identityType === row.identityType,
  );
  return (
    <div className="member-editor">
      <div className="member-editor-heading">
        <h2>
          {editable ? "分配角色" : "成员详情"} · {row.realName}
        </h2>
        <p>
          登录账号 {row.username} · {row.typeName}
        </p>
        <p>
          {row.phoneMasked ?? "未填写手机号"} ·{" "}
          {row.status === 1 ? "身份已启用" : "身份已停用"}
          {row.accountStatus === 0 ? " · 账号已停用" : ""}
        </p>
      </div>
      <SchemaForm
        schema={editMemberFormSchema}
        scopeKey={row.id}
        version={row.version}
        initialValues={memberValues(row)}
        submitLabel="保存"
        disabled={!editable}
        onPendingChange={onPendingChange}
        onCancel={onClose}
        fields={[
          {
            name: "departmentId",
            required: false,
            label: "所在部门",
            type: "custom",
            readOnly: !editable,
            description: "部门决定负责范围，角色决定操作权限。",
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
            required: false,
            label: "职务",
            readOnly: !editable,
            placeholder: "请输入职务",
          },
          {
            name: "roleIds",
            required: false,
            label: "角色（可以多选）",
            type: "custom",
            readOnly: !assign,
            ...(!assign
              ? { readOnlyReason: "当前成员的角色不能由你修改。" }
              : {}),
            render: ({ value, disabled, onChange }) => (
              <MemberRolePicker
                roles={roles}
                selected={Array.isArray(value) ? value : []}
                existing={row.roles}
                disabled={disabled}
                onChange={onChange}
              />
            ),
          },
        ]}
        onSubmit={async (value, context) => {
          await onSave(
            {
              version: value.version,
              departmentId: value.departmentId ?? null,
              title: value.title || null,
              ...(assign &&
              [...(value.roleIds ?? [])].sort().join() !==
                row.roles
                  .map((role) => role.id)
                  .sort()
                  .join()
                ? { roleIds: value.roleIds ?? [] }
                : {}),
            },
            context,
          );
          onClose();
        }}
        onReload={async () => {
          const fresh = await onReload();
          return { values: memberValues(fresh), version: fresh.version };
        }}
      >
        {({ values }) => (
          <>
            <MemberPreview
              readOnly={!editable}
              incomplete={
                Array.isArray(values.roleIds) &&
                values.roleIds.some(
                  (id) => !roles.some((role) => role.id === id),
                )
              }
              roles={roles.filter(
                (role) =>
                  Array.isArray(values.roleIds) &&
                  values.roleIds.includes(role.id),
              )}
              identityType={row.identityType}
            />
            <div className="member-other-identities">
              <span>其他组织身份（{row.otherIdentities.length}）</span>
              {row.otherIdentities.map((item) => (
                <span key={`${item.orgName}:${item.typeName}`}>
                  <Chip size="sm">{item.typeName}</Chip> {item.orgName} ·{" "}
                  {item.status === 1 ? "启用" : "停用"}
                </span>
              ))}
              <p>其他组织的身份由对方管理员管理。</p>
            </div>
          </>
        )}
      </SchemaForm>
    </div>
  );
}

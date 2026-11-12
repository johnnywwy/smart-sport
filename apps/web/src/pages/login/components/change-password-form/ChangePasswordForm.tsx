import { changePasswordRequestSchema } from "@smart-sport/contracts";
import { SchemaForm } from "../../../../shared/components/schema-form/SchemaForm";
import type { useChangePassword } from "../../hooks/use-change-password";

type ChangePasswordFormProps = { state: ReturnType<typeof useChangePassword> };
export function ChangePasswordForm({ state }: ChangePasswordFormProps) {
  return (
    <SchemaForm
      appearance="auth"
      schema={changePasswordRequestSchema}
      fields={[
        {
          name: "oldPassword",
          label: "当前密码",
          type: "password",
          autoComplete: "current-password",
          placeholder: "请输入当前密码",
          validationMessage: "请输入当前密码",
        },
        {
          name: "newPassword",
          label: "新密码",
          type: "password",
          autoComplete: "new-password",
          placeholder: "请输入新密码",
          validationMessage: "请输入新密码",
        },
      ]}
      submitLabel="保存并继续"
      onSubmit={state.submit}
      errors={state.fields}
    >
      <p className="text-sm leading-6 text-muted">
        请设置与原密码不同的密码。生产环境至少 8
        位，同时包含字母和数字，且不能与最近 3 次密码相同。
      </p>
      <p
        role={state.message ? "alert" : "status"}
        className="auth-form-feedback"
        aria-live="polite"
      >
        {state.message}
      </p>
    </SchemaForm>
  );
}

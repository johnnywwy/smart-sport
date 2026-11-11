import { Button } from "@heroui/react";
import { type LoginRequest, loginRequestSchema } from "@smart-sport/contracts";
import { useState } from "react";
import { SchemaForm } from "../../../../shared/components/schema-form/SchemaForm";

type LoginFormProps = {
  state: {
    submit: (input: LoginRequest) => Promise<void>;
    fields: Record<string, string[]>;
    message: string;
  };
};
export function LoginForm({ state }: LoginFormProps) {
  const [showResetHelp, setShowResetHelp] = useState(false);
  return (
    <div className="auth-form-wrapper">
      <SchemaForm
        schema={loginRequestSchema}
        fields={[
          {
            name: "account",
            label: "账号",
            autoComplete: "username",
            placeholder: "请输入账号",
            validationMessage: "请输入账号",
          },
          {
            name: "password",
            label: "密码",
            type: "password",
            autoComplete: "current-password",
            placeholder: "请输入密码",
            validationMessage: "请输入密码",
            accessory: (
              <Button
                variant="ghost"
                size="sm"
                className="auth-forgot"
                onPress={() => setShowResetHelp(true)}
              >
                忘记密码
              </Button>
            ),
          },
        ]}
        submitLabel="登录"
        onSubmit={state.submit}
        errors={state.fields}
      >
        <p
          role={state.message ? "alert" : "status"}
          className="auth-form-feedback"
          aria-live="polite"
        >
          {state.message || (showResetHelp ? "请联系管理员重置密码。" : "")}
        </p>
      </SchemaForm>
    </div>
  );
}

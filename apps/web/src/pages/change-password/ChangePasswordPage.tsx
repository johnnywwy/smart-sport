import { Navigate } from "react-router";
import { useSession } from "../../shared/stores/session";
import { AuthLayout } from "../login/components/auth-layout/AuthLayout";
import { ChangePasswordForm } from "../login/components/change-password-form/ChangePasswordForm";
import { useChangePassword } from "../login/hooks/use-change-password";

export function ChangePasswordPage() {
  const token = useSession((state) => state.accessToken);
  const state = useChangePassword();
  if (!token) return <Navigate to="/login" replace />;
  return (
    <AuthLayout
      title="设置新密码"
      description="为保障账号安全，请修改初始密码后继续"
    >
      <ChangePasswordForm state={state} />
    </AuthLayout>
  );
}

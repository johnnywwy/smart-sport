import { AuthLayout } from "./components/auth-layout/AuthLayout";
import { LoginForm } from "./components/login-form/LoginForm";
import { useLogin } from "./hooks/use-login";

export function LoginPage() {
  const state = useLogin();
  return (
    <AuthLayout title="登录" description="使用用户名、手机号或邮箱">
      <LoginForm state={state} />
    </AuthLayout>
  );
}

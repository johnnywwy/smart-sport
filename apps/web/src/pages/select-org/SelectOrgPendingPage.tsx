import { Button } from "@heroui/react";
import { Navigate } from "react-router";
import { useSession } from "../../shared/stores/session";
import { AuthLayout } from "../login/components/auth-layout/AuthLayout";
import { useSignOut } from "../login/hooks/use-sign-out";

export function SelectOrgPendingPage() {
  const token = useSession((state) => state.accessToken);
  const mustChangePassword = useSession((state) => state.mustChangePassword);
  const identityCount = useSession((state) => state.identityCount);
  const { pending, signOut } = useSignOut();
  if (!token) return <Navigate to="/login" replace />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;
  return (
    <AuthLayout title="登录成功" description="账号验证已完成">
      <p role="status" className="mb-6 text-sm leading-7 text-muted">
        {identityCount === 0
          ? "当前账号暂无可用身份，请联系管理员。"
          : "选择组织功能正在建设中，暂时无法进入应用。"}
      </p>
      <Button
        variant="secondary"
        isDisabled={pending}
        onPress={() => void signOut()}
      >
        {pending ? "正在退出…" : "退出登录"}
      </Button>
    </AuthLayout>
  );
}

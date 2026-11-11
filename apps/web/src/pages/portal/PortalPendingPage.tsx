import { Button, Card } from "@heroui/react";
import { Navigate } from "react-router";
import { useSession } from "../../shared/stores/session";
import { useSignOut } from "../login/hooks/use-sign-out";

export function PortalPendingPage() {
  const token = useSession((state) => state.accessToken);
  const identity = useSession((state) => state.currentIdentity);
  const { pending, signOut } = useSignOut();
  if (!token) return <Navigate to="/login" replace />;
  if (!identity) return <Navigate to="/select-org" replace />;
  return (
    <main className="workspace">
      <Card>
        <Card.Header>
          <Card.Title>已进入 {identity.orgName}</Card.Title>
          <Card.Description>
            当前身份：{identity.title ?? identity.typeName}
            。模块门户将在下一任务中接入真实应用与指标数据。
          </Card.Description>
        </Card.Header>
        <Card.Footer>
          <Button
            variant="secondary"
            isDisabled={pending}
            onPress={() => void signOut()}
          >
            {pending ? "正在退出…" : "退出登录"}
          </Button>
        </Card.Footer>
      </Card>
    </main>
  );
}

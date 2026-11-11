import { Button, Spinner } from "@heroui/react";
import { type ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { ApiError } from "../../../shared/api/api-error";
import { restoreSession } from "../../../shared/hooks/restore-session";
import { useSession } from "../../../shared/stores/session";
import "./SessionBootstrap.css";
export function SessionBootstrap({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const { pathname } = useLocation();
  const token = useSession((s) => s.accessToken);
  const changePassword = useSession((s) => s.mustChangePassword);
  useEffect(() => {
    let active = true;
    void attempt;
    setState("loading");
    restoreSession().then(
      () => {
        if (active) setState("ready");
      },
      (error) => {
        if (!active) return;
        setState(
          error instanceof ApiError && error.status === 401 ? "ready" : "error",
        );
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  if (state === "loading")
    return (
      <main className="session-bootstrap" role="status">
        <Spinner />
        <p>正在恢复登录状态…</p>
      </main>
    );
  if (state === "error")
    return (
      <main className="session-bootstrap" role="alert">
        <p>暂时无法恢复登录状态，请检查网络后重试。</p>
        <Button onPress={() => setAttempt((n) => n + 1)}>重试</Button>
      </main>
    );
  if (token && changePassword && pathname !== "/change-password")
    return <Navigate to="/change-password" replace />;
  if (token && pathname === "/login")
    return (
      <Navigate
        to={useSession.getState().currentIdentity ? "/modules" : "/select-org"}
        replace
      />
    );
  return children;
}

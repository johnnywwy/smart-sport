import { useState } from "react";
import { useNavigate } from "react-router";
import { logoutAccount } from "../../../shared/hooks/auth-actions";

export function useSignOut() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const signOut = async () => {
    setPending(true);
    try {
      await logoutAccount();
    } catch {
      /* 本地会话已清除，下次登录会新建会话。 */
    } finally {
      setPending(false);
      navigate("/login", { replace: true });
    }
  };
  return { pending, signOut };
}

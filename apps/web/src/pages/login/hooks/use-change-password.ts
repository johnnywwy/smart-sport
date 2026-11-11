import type { ChangePasswordRequest } from "@smart-sport/contracts";
import { useNavigate } from "react-router";
import { changeAccountPassword } from "../../../shared/hooks/auth-actions";
import { useApiEvents } from "../../../shared/stores/api-events";
import { useAuthForm } from "./use-auth-form";

export function useChangePassword() {
  const navigate = useNavigate();
  const feedback = useAuthForm();
  const submit = async (input: ChangePasswordRequest) => {
    feedback.reset();
    try {
      await changeAccountPassword(input);
      useApiEvents
        .getState()
        .notifySuccess("新密码已生效，请继续选择组织", "密码修改成功");
      navigate("/select-org", { replace: true });
    } catch (error) {
      feedback.fail(error);
    }
  };
  return { ...feedback, submit };
}

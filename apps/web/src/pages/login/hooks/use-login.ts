import type { LoginRequest } from "@smart-sport/contracts";
import { useNavigate } from "react-router";
import { loginAccount } from "../../../shared/hooks/auth-actions";
import { useAuthForm } from "./use-auth-form";

export function useLogin() {
  const navigate = useNavigate();
  const feedback = useAuthForm();
  const submit = async (input: LoginRequest) => {
    feedback.reset();
    try {
      navigate(await loginAccount(input), { replace: true });
    } catch (error) {
      feedback.fail(error);
    }
  };
  return { ...feedback, submit };
}

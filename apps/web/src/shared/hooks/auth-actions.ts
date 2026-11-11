import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  emptyResultSchema,
  type LoginRequest,
  loginRequestSchema,
  loginResponseSchema,
} from "@smart-sport/contracts";
import { SessionChangedError } from "../api/api-error";
import { apiClient } from "../api/client";
import { useSession } from "../stores/session";

export async function loginAccount(input: LoginRequest) {
  const generation = useSession.getState().generation;
  const result = await apiClient.request(
    "/api/v1/auth/login",
    loginResponseSchema,
    {
      method: "POST",
      body: loginRequestSchema.parse(input),
      auth: false,
    },
  );
  if (useSession.getState().generation !== generation)
    throw new SessionChangedError();
  useSession.getState().startSession(result.accessToken);
  useSession
    .getState()
    .setLoginContext(result.mustChangePassword, result.identityCount);
  return result.mustChangePassword
    ? "/change-password"
    : result.selectedIdentity
      ? "/portal"
      : "/select-org";
}
export async function changeAccountPassword(input: ChangePasswordRequest) {
  const generation = useSession.getState().generation;
  await apiClient.request("/api/v1/auth/change-password", emptyResultSchema, {
    method: "POST",
    body: changePasswordRequestSchema.parse(input),
  });
  await apiClient.refresh();
  if (useSession.getState().generation !== generation)
    throw new SessionChangedError();
  useSession
    .getState()
    .setLoginContext(false, useSession.getState().identityCount ?? 0);
}
export async function logoutAccount() {
  try {
    await apiClient.request("/api/v1/auth/logout", emptyResultSchema, {
      method: "POST",
      auth: false,
      notify: false,
    });
  } finally {
    useSession.getState().clearSession();
  }
}

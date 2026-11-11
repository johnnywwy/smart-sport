import { authSessionSchema } from "@smart-sport/contracts";
import { apiClient } from "../api/client";
import { useSession } from "../stores/session";

let restoring: Promise<void> | undefined;
export function restoreSession() {
  if (
    useSession.getState().accessToken &&
    useSession.getState().mustChangePassword !== null
  )
    return Promise.resolve();
  if (restoring) return restoring;
  restoring = (async () => {
    if (!useSession.getState().accessToken) await apiClient.refresh(true);
    const generation = useSession.getState().generation;
    const result = await apiClient.request(
      "/api/v1/auth/session",
      authSessionSchema,
      { notify: false },
    );
    if (useSession.getState().generation !== generation) return;
    const token = useSession.getState().accessToken;
    if (result.currentIdentity && token)
      useSession.getState().selectIdentity(token, result.currentIdentity);
    useSession
      .getState()
      .setLoginContext(result.mustChangePassword, result.identityCount);
  })().finally(() => {
    restoring = undefined;
  });
  return restoring;
}

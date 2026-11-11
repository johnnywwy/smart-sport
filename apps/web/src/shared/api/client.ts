import { useApiEvents } from "../stores/api-events";
import { useSession } from "../stores/session";
import { createApiClient } from "./create-api-client";

export const apiClient = createApiClient({
  session: {
    get: useSession.getState,
    refreshToken: (token, generation) =>
      useSession.getState().refreshToken(token, generation),
    clear: () => useSession.getState().clearSession(),
  },
  onError: (error) => {
    if (!error.fields) useApiEvents.getState().notifyError(error.message);
  },
  onUnauthenticated: () => {
    useApiEvents.getState().notifyError("登录已过期，请重新登录", "会话已失效");
    useApiEvents.getState().navigate("login");
  },
  onIdentityChanged: () => {
    useApiEvents.getState().notifyError("已在其他页面切换身份", "身份已变更");
    useApiEvents.getState().navigate("portal");
  },
  onVersion: (version) => useApiEvents.getState().observeVersion(version),
});

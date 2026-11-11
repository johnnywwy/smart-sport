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
  onError: (error) => useApiEvents.getState().notify(error.message),
  onUnauthenticated: () => {
    useApiEvents.getState().notify("登录已过期，请重新登录");
    useApiEvents.getState().navigate("login");
  },
  onIdentityChanged: () => {
    useApiEvents.getState().notify("已在其他页面切换身份");
    useApiEvents.getState().navigate("portal");
  },
  onVersion: (version) => useApiEvents.getState().observeVersion(version),
});

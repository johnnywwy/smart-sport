import { toast } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { OperationNotice } from "../../shared/components/operation-notice/OperationNotice";
import { VersionWatcher } from "../../shared/components/version-watcher/VersionWatcher";
import { useApiEvents } from "../../shared/stores/api-events";
import { useSession } from "../../shared/stores/session";

export function ApiEffects() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const notices = useApiEvents((state) => state.notices);
  const navigation = useApiEvents((state) => state.navigation);
  const version = useApiEvents((state) => state.availableVersion);
  useEffect(
    () =>
      useSession.subscribe((state, previous) => {
        if (state.generation !== previous.generation) queryClient.clear();
      }),
    [queryClient],
  );
  useEffect(() => {
    if (!notices.length) return;
    for (const notice of useApiEvents.getState().drainNotices())
      toast.danger(notice.message, { timeout: 0 });
  }, [notices]);
  useEffect(() => {
    if (!navigation) return;
    useApiEvents.getState().consumeNavigation();
    navigate(navigation === "login" ? "/login" : "/portal", { replace: true });
  }, [navigation, navigate]);
  return (
    <>
      <OperationNotice />
      <VersionWatcher
        available={version !== null}
        onReload={() => window.location.reload()}
      />
    </>
  );
}

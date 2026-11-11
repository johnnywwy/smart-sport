import { BackendHealth } from "../../../../shared/components/backend-health/BackendHealth";
import { useBackendHealth } from "../../../../shared/hooks/use-backend-health";

export function BackendHealthStatus() {
  const { data, isError } = useBackendHealth();
  const status = isError
    ? "error"
    : data?.status === "ready"
      ? "ready"
      : data
        ? "not-ready"
        : "loading";
  return <BackendHealth status={status} />;
}

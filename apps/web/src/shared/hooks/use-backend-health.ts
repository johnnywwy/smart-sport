import { readinessSchema } from "@smart-sport/contracts";
import { useQuery } from "@tanstack/react-query";
import { createRequestSignal } from "../api/request-signal";

export function useBackendHealth() {
  return useQuery({
    queryKey: ["backend-readiness"],
    queryFn: async ({ signal }) => {
      const requestSignal = createRequestSignal(signal, 6000);
      try {
        const response = await fetch("/health/ready", {
          signal: requestSignal.signal,
        });
        if (response.status !== 200 && response.status !== 503) {
          throw new Error("健康检查请求失败");
        }
        return readinessSchema.parse(await response.json());
      } finally {
        requestSignal.dispose();
      }
    },
    retry: false,
    refetchInterval: 30000,
  });
}

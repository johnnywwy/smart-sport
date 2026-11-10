import { Chip } from "@heroui/react";
import { readinessSchema } from "@smart-sport/contracts";
import { useQuery } from "@tanstack/react-query";

export function BackendHealth() {
  const { data, isError } = useQuery({
    queryKey: ["backend-readiness"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/health/ready", {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      });
      if (response.status !== 200 && response.status !== 503) {
        throw new Error("健康检查请求失败");
      }
      return readinessSchema.parse(await response.json());
    },
    retry: false,
    refetchInterval: 30000,
  });

  return (
    <Chip size="sm" variant="soft">
      {isError
        ? "后端连接失败"
        : data?.status === "ready"
          ? "后端已就绪"
          : data
            ? "后端依赖未就绪"
            : "正在检查后端"}
    </Chip>
  );
}

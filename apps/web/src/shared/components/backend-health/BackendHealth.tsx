import { Chip } from "@heroui/react";

type BackendHealthProps = {
  status: "loading" | "ready" | "not-ready" | "error";
};

export function BackendHealth({ status }: BackendHealthProps) {
  const labels = {
    loading: "正在检查后端",
    ready: "后端已就绪",
    "not-ready": "后端依赖未就绪",
    error: "后端连接失败",
  };
  return (
    <Chip size="sm" variant="soft">
      {labels[status]}
    </Chip>
  );
}

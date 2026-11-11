import { Chip } from "@heroui/react";
import type { ReactNode } from "react";

type WelcomePanelProps = { status?: ReactNode };

export function WelcomePanel({ status }: WelcomePanelProps) {
  return (
    <div className="space-y-3">
      <Chip size="sm" variant="soft">
        界面预览 · 示例数据
      </Chip>
      {status}
      <h1 className="text-3xl font-semibold tracking-tight">
        让每一所学校，连接更好的体育教育
      </h1>
      <p className="text-muted">智慧体育云平台 · 工作台</p>
    </div>
  );
}

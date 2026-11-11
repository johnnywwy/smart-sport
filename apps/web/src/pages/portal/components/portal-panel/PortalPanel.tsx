import { Card } from "@heroui/react";
import type { ReactNode } from "react";
import "./PortalPanel.css";

type PortalPanelProps = { title: string; hint?: string; children: ReactNode };
export function PortalPanel({ title, hint, children }: PortalPanelProps) {
  return (
    <Card className="portal-secondary-card">
      <Card.Header>
        <Card.Title>{title}</Card.Title>
        {hint && <span className="text-xs text-[#63636b]">{hint}</span>}
      </Card.Header>
      <Card.Content>{children}</Card.Content>
    </Card>
  );
}

import "./ApplicationCard.css";
import { Button } from "@heroui/react";
import type { AvailableApp } from "@smart-sport/contracts";
import { ApplicationIcon } from "../application-icon/ApplicationIcon";
export function ApplicationCard({
  app,
  onOpen,
}: {
  app: AvailableApp;
  onOpen: () => void;
}) {
  return (
    <Button
      className="portal-application-card"
      variant="secondary"
      onPress={onOpen}
      aria-label={`进入${app.name}`}
    >
      <span className="portal-app-card-top">
        <ApplicationIcon code={app.code} />
        <svg
          className="portal-card-arrow"
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      </span>
      <span className="portal-app-name">{app.name}</span>
      <span className="portal-app-description">{app.description}</span>
      <span className="portal-app-entry">
        进入应用 <span aria-hidden="true">→</span>
      </span>
    </Button>
  );
}

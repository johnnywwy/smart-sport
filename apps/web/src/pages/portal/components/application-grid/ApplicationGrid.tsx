import "./ApplicationGrid.css";
import type { AvailableApp } from "@smart-sport/contracts";
import { ApplicationCard } from "../application-card/ApplicationCard";
export function ApplicationGrid({
  apps,
  onOpen,
}: {
  apps: AvailableApp[];
  onOpen: (app: AvailableApp) => void;
}) {
  return (
    <div className="portal-application-grid">
      {apps.map((app) => (
        <ApplicationCard key={app.code} app={app} onOpen={() => onOpen(app)} />
      ))}
    </div>
  );
}

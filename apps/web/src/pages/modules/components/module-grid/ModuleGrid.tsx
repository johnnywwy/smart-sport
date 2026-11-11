import type { AvailableModule } from "@smart-sport/contracts";
import { ModuleCard } from "../module-card/ModuleCard";
import "./ModuleGrid.css";
export function ModuleGrid({
  modules,
  onOpen,
}: {
  modules: AvailableModule[];
  onOpen: (module: AvailableModule) => void;
}) {
  return (
    <div className="module-grid">
      {modules.map((module) => (
        <ModuleCard
          key={module.code}
          module={module}
          onOpen={() => onOpen(module)}
        />
      ))}
    </div>
  );
}

import { Button, Chip } from "@heroui/react";
import type { AvailableModule } from "@smart-sport/contracts";
import { ModuleIcon } from "../module-icon/ModuleIcon";
import "./ModuleCard.css";
export function ModuleCard({
  module,
  onOpen,
}: {
  module: AvailableModule;
  onOpen: () => void;
}) {
  const remaining = Math.max(0, module.menuCount - module.menuPreview.length);
  return (
    <Button
      className="module-card"
      variant="secondary"
      onPress={onOpen}
      aria-label={`进入${module.name}`}
    >
      <span className="module-card-top">
        <ModuleIcon code={module.code} />
        <span className="module-card-arrow" aria-hidden="true">
          ↗
        </span>
      </span>
      <span className="module-card-name">{module.name}</span>
      <span className="module-card-description">{module.description}</span>
      <span className="module-card-preview">
        {module.menuPreview.map((name) => (
          <Chip key={name} size="sm" variant="soft">
            {name}
          </Chip>
        ))}
        {remaining > 0 && (
          <span className="module-card-more">另外 {remaining} 项</span>
        )}
      </span>
      {module.code === "platform-admin" && (
        <span className="module-card-company">仅公司可见</span>
      )}
    </Button>
  );
}

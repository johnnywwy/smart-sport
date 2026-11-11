import { KPIGroup } from "@heroui-pro/react/kpi-group";
import type { ComponentProps } from "react";
import { PortalKpiCard } from "../portal-kpi-card/PortalKpiCard";

type PortalKpiGroupProps = {
  metrics: readonly ComponentProps<typeof PortalKpiCard>[];
};

export function PortalKpiGroup({ metrics }: PortalKpiGroupProps) {
  return (
    <KPIGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <PortalKpiCard key={metric.label} {...metric} />
      ))}
    </KPIGroup>
  );
}

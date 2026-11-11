import { KPI } from "@heroui-pro/react/kpi";

type PortalKpiCardProps = {
  label: string;
  value: number;
  history: readonly number[];
};

export function PortalKpiCard({ label, value, history }: PortalKpiCardProps) {
  return (
    <KPI className="min-w-0">
      <KPI.Header>
        <KPI.Title>{label}</KPI.Title>
      </KPI.Header>
      <KPI.Content>
        <KPI.Value value={value} />
      </KPI.Content>
      <KPI.Chart
        data={history.map((value) => ({ value }))}
        height={64}
        color="var(--accent)"
      />
      <KPI.Footer>
        <span className="text-xs text-muted">示例趋势 · 尚未连接业务接口</span>
      </KPI.Footer>
    </KPI>
  );
}

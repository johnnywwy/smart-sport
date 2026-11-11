import "./PortalKpiGroup.css";
import { KPI } from "@heroui-pro/react/kpi";
import { KPIGroup } from "@heroui-pro/react/kpi-group";
import type { IdentitySummary, ModuleCode } from "@smart-sport/contracts";

const labels = {
  company: ["负责学校", "试用中", "30 天内到期", "待审核开通"],
  bureau: ["辖区学校", "已开通平台学校", "区县开通情况"],
  agent: ["授权学校", "即将到期的授权", "本部门负责学校"],
  school: ["班级", "学生", "教师", "待确认转学"],
  teacher: ["任教班级", "任教学生"],
  student: [],
  parent: [],
} satisfies Record<IdentitySummary["type"], string[]>;
export function PortalKpiGroup({
  type,
  module,
}: {
  type: IdentitySummary["type"];
  module?: ModuleCode;
}) {
  return (
    <section aria-label="工作台指标">
      <KPIGroup className="portal-kpi-grid">
        {(module === "platform-admin"
          ? ["已开通学校", "试用中", "30 天内到期", "待审核开通"]
          : labels[type]
        ).map((label) => (
          <KPI key={label} className="portal-kpi-card">
            <KPI.Header>
              <KPI.Title>{label}</KPI.Title>
            </KPI.Header>
            <KPI.Content>
              <span className="portal-kpi-value">—</span>
            </KPI.Content>
            <KPI.Footer>
              <span className="text-xs text-[#63636b]">统计暂未开放</span>
            </KPI.Footer>
          </KPI>
        ))}
      </KPIGroup>
    </section>
  );
}

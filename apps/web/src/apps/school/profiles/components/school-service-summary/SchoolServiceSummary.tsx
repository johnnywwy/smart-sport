import { Button, Chip, Spinner } from "@heroui/react";
import { moduleDefinitions, type SchoolApps } from "@smart-sport/contracts";
import "./SchoolServiceSummary.css";

const statuses = {
  trial: { label: "试用中", color: "accent" },
  active: { label: "服务中", color: "success" },
  grace: { label: "宽限期", color: "warning" },
  suspended: { label: "已停用", color: "danger" },
} as const;
export function SchoolServiceSummary({
  service,
  loading,
  error,
  onRetry,
}: {
  service: SchoolApps | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const codes = new Set(service?.apps.map((app) => app.code));
  const modules = moduleDefinitions.filter((module) =>
    module.groups.some((group) =>
      group.menus.some((menu) =>
        menu.features.some((feature) => codes.has(feature.app)),
      ),
    ),
  );
  const status = service ? statuses[service.status] : null;
  return (
    <section className="school-profile-card school-service-summary">
      <h2>平台服务</h2>
      {loading ? (
        <div className="school-service-status" role="status">
          <Spinner size="sm" />
          <span>正在加载服务信息…</span>
        </div>
      ) : error ? (
        <div role="alert">
          <p>服务信息加载失败</p>
          <Button size="sm" variant="ghost" onPress={onRetry}>
            重试
          </Button>
        </div>
      ) : service && status ? (
        <>
          <div className="school-service-status">
            <Chip size="sm" color={status.color}>
              {service.serviceEnd ? status.label : "未开通"}
            </Chip>
            {service.serviceEnd ? (
              <p>到期日 {service.serviceEnd}</p>
            ) : (
              <p>尚未开通服务</p>
            )}
          </div>
          {service.status === "grace" && (
            <span>宽限至 {service.graceEnd}，仅可查看和导出。</span>
          )}
          {service.accessMode === "export" && (
            <span>服务已停用，仅保留学校管理员的导出权限。</span>
          )}
          <div className="school-service-modules">
            <span>已开通的模块</span>
            <div>
              {modules.length ? (
                modules.map((module) => (
                  <Chip
                    key={module.code}
                    size="sm"
                    className="school-service-module"
                  >
                    {module.name}
                  </Chip>
                ))
              ) : (
                <span>暂无可用模块</span>
              )}
            </div>
          </div>
          <span>服务期和模块由平台设置，需要调整请联系负责的销售。</span>
        </>
      ) : (
        <p>暂无服务信息</p>
      )}
    </section>
  );
}

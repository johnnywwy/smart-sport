import "./WelcomePanel.css";
import type { IdentitySummary } from "@smart-sport/contracts";
export function WelcomePanel({ identity }: { identity: IdentitySummary }) {
  return (
    <div className="portal-welcome">
      <div>
        <p className="portal-eyebrow">工作台</p>
        <h1>欢迎回来</h1>
        <p>
          {identity.orgName} · {identity.title ?? identity.typeName}
        </p>
      </div>
      <div className="portal-welcome-note">
        <span className="portal-live-dot" />
        当前身份的应用已按权限展示
      </div>
    </div>
  );
}

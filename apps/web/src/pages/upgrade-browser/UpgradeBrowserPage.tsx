import { browserRequirements } from "../../shared/browser/browser-support";
import { BrowserOptions } from "./components/browser-options/BrowserOptions";
import { UpgradeIntroduction } from "./components/upgrade-introduction/UpgradeIntroduction";

export function UpgradeBrowserPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-16">
      <UpgradeIntroduction />
      <BrowserOptions browsers={browserRequirements} />
      <p className="text-sm text-muted">
        Safari 随系统更新。若电脑由单位统一管理，请联系管理员协助更新浏览器。
      </p>
    </main>
  );
}

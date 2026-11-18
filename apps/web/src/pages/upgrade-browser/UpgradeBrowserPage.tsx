import { browserRequirements } from "../../shared/browser/browser-support";
import { BrowserOptions } from "./components/browser-options/BrowserOptions";
import { UpgradeIntroduction } from "./components/upgrade-introduction/UpgradeIntroduction";

export function UpgradeBrowserPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-16">
      <UpgradeIntroduction />
      <BrowserOptions browsers={browserRequirements} />
      <p className="text-sm text-muted">
        iPhone / iPad 的微信内置浏览器随系统更新，请使用 iOS / iPadOS 16.4
        或更新版本。Android
        微信请先更新微信；仍无法打开时，可在右上角菜单选择在新版系统浏览器中打开。
      </p>
    </main>
  );
}

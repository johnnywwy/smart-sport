import { Sidebar } from "@heroui-pro/react/sidebar";
import { ThemeToggle } from "../theme-toggle/ThemeToggle";

type AppHeaderProps = {
  showSidebarTrigger: boolean;
  dark: boolean;
  onToggleTheme: () => void;
};

export function AppHeader({
  showSidebarTrigger,
  dark,
  onToggleTheme,
}: AppHeaderProps) {
  return (
    <div className="flex w-full items-center justify-between gap-4 px-5 py-3">
      <div className="flex items-center gap-3">
        {showSidebarTrigger && <Sidebar.Trigger aria-label="展开或收起侧栏" />}
        <span className="font-semibold">智慧体育云平台</span>
      </div>
      <ThemeToggle dark={dark} onToggle={onToggleTheme} />
    </div>
  );
}

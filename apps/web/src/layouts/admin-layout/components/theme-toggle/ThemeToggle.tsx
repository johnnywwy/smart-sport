import { Button } from "@heroui/react";

type ThemeToggleProps = { dark: boolean; onToggle: () => void };

export function ThemeToggle({ dark, onToggle }: ThemeToggleProps) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onPress={onToggle}
      aria-label={dark ? "切换浅色主题" : "切换深色主题"}
    >
      {dark ? "浅色主题" : "深色主题"}
    </Button>
  );
}

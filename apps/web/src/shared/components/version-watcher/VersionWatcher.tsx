import { Button, Card } from "@heroui/react";

type VersionWatcherProps = { available: boolean; onReload: () => void };

export function VersionWatcher({ available, onReload }: VersionWatcherProps) {
  if (!available) return null;
  return (
    <Card role="status" className="fixed right-6 bottom-6 z-50 max-w-sm">
      <Card.Header>
        <Card.Title>系统已更新，请刷新</Card.Title>
      </Card.Header>
      <Card.Footer>
        <Button onPress={onReload}>刷新页面</Button>
      </Card.Footer>
    </Card>
  );
}

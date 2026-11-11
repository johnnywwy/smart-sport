import { Button, Card } from "@heroui/react";

type WorkspacePreviewCardProps = { onPreview: () => void };

export function WorkspacePreviewCard({ onPreview }: WorkspacePreviewCardProps) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>从统一的工作台开始</Card.Title>
        <Card.Description>
          应用入口将在登录、选择组织和权限接口完成后，按当前身份开放。
        </Card.Description>
      </Card.Header>
      <Card.Footer>
        <Button variant="secondary" onPress={onPreview}>
          预览应用布局
        </Button>
      </Card.Footer>
    </Card>
  );
}

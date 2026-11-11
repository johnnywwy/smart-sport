import "./WorkspacePage.css";
import { Card, Chip } from "@heroui/react";

export function WorkspacePage() {
  return (
    <div className="workspace-page space-y-6">
      <Chip variant="soft" size="sm">
        界面预览
      </Chip>
      <h1 className="text-3xl font-semibold">应用工作区</h1>
      <Card>
        <Card.Header>
          <Card.Title>为学校管理准备的统一空间</Card.Title>
          <Card.Description>
            侧栏支持展开、收起与窄屏抽屉；主题和侧栏偏好会保留。
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <p className="text-muted">
            业务页面将按 docs
            中的功能切片接入。当前未连接认证、学校数据或权限接口。
          </p>
        </Card.Content>
      </Card>
    </div>
  );
}

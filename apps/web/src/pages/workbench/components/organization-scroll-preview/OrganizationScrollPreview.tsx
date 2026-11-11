import { Card, Chip } from "@heroui/react";
import "./OrganizationScrollPreview.css";

const organizations = Array.from({ length: 40 }, (_, index) => ({
  name: `模拟机构 ${String(index + 1).padStart(2, "0")}`,
  type: index % 2 === 0 ? "教育局" : "代理商",
}));

export function OrganizationScrollPreview() {
  return (
    <section className="organization-scroll-preview">
      <header>
        <h1>机构管理</h1>
        <p>长页面滚动预览 · 以下 40 条均为模拟机构，不会写入数据库。</p>
      </header>
      {organizations.map((organization) => (
        <Card
          key={organization.name}
          className="organization-scroll-preview-card"
        >
          <Card.Content>
            <div>
              <h2>{organization.name}</h2>
              <p>{organization.type} · 仅用于观察页面滚动</p>
            </div>
            <Chip variant="soft" size="sm">
              模拟数据
            </Chip>
          </Card.Content>
        </Card>
      ))}
      <p className="organization-scroll-preview-end">
        已到达模拟页面底部 · 共 40 条
      </p>
    </section>
  );
}

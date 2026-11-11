import { Card, Chip } from "@heroui/react";

type ApplicationCardProps = { name: string; description: string };

export function ApplicationCard({ name, description }: ApplicationCardProps) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>{name}</Card.Title>
        <Card.Description>{description}</Card.Description>
      </Card.Header>
      <Card.Footer>
        <Chip size="sm" variant="soft">
          待业务切片接入
        </Chip>
      </Card.Footer>
    </Card>
  );
}

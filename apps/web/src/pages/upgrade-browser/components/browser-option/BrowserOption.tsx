import { Card, Link } from "@heroui/react";

type BrowserOptionProps = {
  name: string;
  minimumVersion: string;
  href: string;
  action: string;
};

export function BrowserOption({
  name,
  minimumVersion,
  href,
  action,
}: BrowserOptionProps) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>{name}</Card.Title>
        <Card.Description>最低版本 {minimumVersion}</Card.Description>
      </Card.Header>
      <Card.Footer>
        <Link href={href} target="_blank" rel="noopener noreferrer">
          {action}
        </Link>
      </Card.Footer>
    </Card>
  );
}

import { Button, Card } from "@heroui/react";
import { useNavigate } from "react-router";

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="workspace">
      <Card>
        <Card.Header>
          <Card.Title>页面不存在</Card.Title>
        </Card.Header>
        <Card.Footer>
          <Button onPress={() => navigate("/preview/portal")}>返回预览</Button>
        </Card.Footer>
      </Card>
    </div>
  );
}

import "./OperationNotice.css";
import { Toast } from "@heroui/react";

export function OperationNotice() {
  return (
    <Toast.Provider
      placement="top end"
      width={360}
      gap={12}
      maxVisibleToasts={3}
      className="operation-notice-region"
    />
  );
}

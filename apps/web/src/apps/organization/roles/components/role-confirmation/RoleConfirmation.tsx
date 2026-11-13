import { AlertDialog, Button } from "@heroui/react";
import type { RoleConfirmation as Confirmation } from "../../hooks/use-organization-roles";
import "./RoleConfirmation.css";

export function RoleConfirmation({
  value,
  onConfirm,
}: {
  value: Confirmation | null;
  onConfirm: (value: boolean) => void;
}) {
  const reset = value?.kind === "reset";
  return (
    <AlertDialog
      isOpen={!!value}
      onOpenChange={(open) => {
        if (!open) onConfirm(false);
      }}
    >
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="organization-role-confirmation">
            <AlertDialog.Header>
              <AlertDialog.Heading>
                {reset
                  ? `恢复成“${value.role.baseRoleName ?? "基础角色"}”的默认权限？`
                  : `保存对“${value?.role.name ?? ""}”的修改？`}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              {reset && (
                <p className="organization-role-reset-warning">
                  你对“{value?.role.name}”的权限和数据范围调整会全部丢失。
                </p>
              )}
              <p>本组织中使用此角色的成员权限将立即更新，并记入操作记录。</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="secondary" onPress={() => onConfirm(false)}>
                取消
              </Button>
              <Button
                variant={reset ? "danger" : "primary"}
                onPress={() => onConfirm(true)}
              >
                {reset ? "恢复默认" : "确认保存"}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

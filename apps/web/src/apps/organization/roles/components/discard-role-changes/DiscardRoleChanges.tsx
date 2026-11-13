import { AlertDialog, Button } from "@heroui/react";

export function DiscardRoleChanges({
  open,
  onConfirm,
}: {
  open: boolean;
  onConfirm: (value: boolean) => void;
}) {
  return (
    <AlertDialog
      isOpen={open}
      onOpenChange={(value) => {
        if (!value) onConfirm(false);
      }}
    >
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>放弃未保存的改动？</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>当前未保存的设置会丢失。</AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="secondary" onPress={() => onConfirm(false)}>
                继续编辑
              </Button>
              <Button variant="danger" onPress={() => onConfirm(true)}>
                放弃改动
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

import { AlertDialog, Button } from "@heroui/react";
import { useState } from "react";

export function TableConfirmAction({
  label,
  description,
  disabled,
  className,
  onConfirm,
}: {
  label: string;
  description: string;
  disabled: boolean;
  className: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog isOpen={open} onOpenChange={setOpen}>
      <Button variant="ghost" className={className} isDisabled={disabled}>
        {label}
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>确认{label}？</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>{description}</AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="secondary" onPress={() => setOpen(false)}>
                取消
              </Button>
              <Button
                variant="danger"
                isDisabled={disabled}
                onPress={() => {
                  setOpen(false);
                  onConfirm();
                }}
              >
                确认{label}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

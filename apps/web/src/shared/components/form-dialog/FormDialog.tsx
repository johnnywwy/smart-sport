import { Button, Modal } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { SchemaForm } from "../schema-form/SchemaForm";
import type { SchemaFormProps } from "../schema-form/types";
import "./FormDialog.css";

type Props<T> = Omit<
  SchemaFormProps<T>,
  "appearance" | "onCancel" | "onPendingChange"
> & {
  title: string;
  dialogClassName?: string;
  description?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};
export function FormDialog<T>({
  title,
  dialogClassName,
  description = "带 * 的是必填项",
  isOpen,
  onOpenChange,
  ...form
}: Props<T>) {
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      locked.current = false;
      setPending(false);
    }
  }, [isOpen]);
  const close = () => {
    if (!locked.current) onOpenChange(false);
  };
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!locked.current) onOpenChange(open);
      }}
    >
      <Modal.Backdrop
        isDismissable={!pending}
        isKeyboardDismissDisabled={pending}
      >
        <Modal.Container size="lg" placement="center" scroll="inside">
          <Modal.Dialog
            className={["form-dialog", dialogClassName]
              .filter(Boolean)
              .join(" ")}
          >
            <Modal.Header className="form-dialog-header">
              <div>
                <Modal.Heading>{title}</Modal.Heading>
                <p>{description}</p>
              </div>
              <Button
                aria-label="关闭"
                isIconOnly
                variant="secondary"
                className="form-dialog-close"
                isDisabled={pending}
                onPress={close}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </Button>
            </Modal.Header>
            <Modal.Body className="form-dialog-body">
              {isOpen && (
                <SchemaForm
                  {...form}
                  appearance="default"
                  onCancel={close}
                  onPendingChange={(busy) => {
                    locked.current = busy;
                    setPending(busy);
                  }}
                  onSubmit={async (values, context) => {
                    await form.onSubmit(values, context);
                    if (!context.signal.aborted) onOpenChange(false);
                  }}
                />
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

import { AlertDialog, Button } from "@heroui/react";
import type { Department } from "@smart-sport/contracts";
import { useRef, useState } from "react";
import { ApiError } from "../../../../../shared/errors/api-error";
import "./DeleteDepartmentDialog.css";
export function DeleteDepartmentDialog({
  row,
  busy,
  onClose,
  onDelete,
  onReload,
}: {
  row: Department;
  busy: boolean;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [conflict, setConflict] = useState(false);
  const [failed, setFailed] = useState(false);
  const locked = useRef(false);
  return (
    <AlertDialog
      isOpen
      onOpenChange={(open) => {
        if (!open && !locked.current) onClose();
      }}
    >
      <AlertDialog.Backdrop
        isDismissable={!busy}
        isKeyboardDismissDisabled={busy}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="department-delete-dialog">
            <AlertDialog.Header>
              <AlertDialog.Heading>删除部门“{row.name}”？</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="department-delete-warning">
                删除后，该部门将从组织架构中移除。有成员、下级部门或预置标记时不能删除。
              </p>
              {conflict ? (
                <p role="alert">部门已被其他人修改，请重新加载后再确认。</p>
              ) : failed ? (
                <p role="alert">删除未完成，请检查提示后重试。</p>
              ) : null}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="secondary" isDisabled={busy} onPress={onClose}>
                取消
              </Button>
              {conflict ? (
                <Button
                  variant="secondary"
                  isDisabled={busy}
                  onPress={() => {
                    void onReload().catch(() => setFailed(true));
                  }}
                >
                  重新加载
                </Button>
              ) : (
                <Button
                  variant="danger"
                  isPending={busy}
                  isDisabled={busy}
                  onPress={() => {
                    if (locked.current) return;
                    locked.current = true;
                    setFailed(false);
                    void onDelete()
                      .catch((error) => {
                        setConflict(
                          error instanceof ApiError && error.code === 90002,
                        );
                        setFailed(true);
                      })
                      .finally(() => {
                        locked.current = false;
                      });
                  }}
                >
                  确认删除
                </Button>
              )}
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

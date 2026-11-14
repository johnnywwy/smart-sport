import { AlertDialog, Button } from "@heroui/react";
import type { Member } from "@smart-sport/contracts";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../../../../shared/errors/api-error";
import "./MemberStatusDialog.css";
export function MemberStatusDialog({
  row,
  onClose,
  onSave,
  onReload,
}: {
  row: Member;
  onClose: () => void;
  onSave: (signal: AbortSignal) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const lock = useRef(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const close = () => {
    if (!lock.current) onClose();
  };
  return (
    <AlertDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <AlertDialog.Backdrop
        isDismissable={!busy}
        isKeyboardDismissDisabled={busy}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="member-status-dialog">
            <AlertDialog.Header>
              <AlertDialog.Heading>
                {row.status === 1 ? "停用" : "启用"} {row.realName} 的组织身份？
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                {row.status === 1
                  ? "仅停用本组织身份，该身份的登录会话将失效。账号和其他组织身份不受影响。"
                  : "启用后可重新登录本组织，已失效的会话不会恢复。"}
              </p>
              {message && <p role="alert">{message}</p>}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="secondary" isDisabled={busy} onPress={close}>
                取消
              </Button>
              {conflict ? (
                <Button
                  isDisabled={busy}
                  onPress={() => {
                    void onReload().catch(() => {});
                  }}
                >
                  重新加载
                </Button>
              ) : (
                <Button
                  variant={row.status === 1 ? "danger" : "primary"}
                  isDisabled={busy}
                  onPress={() => {
                    if (lock.current) return;
                    lock.current = true;
                    setBusy(true);
                    const controller = new AbortController();
                    active.current = controller;
                    void onSave(controller.signal)
                      .then(onClose)
                      .catch((error) => {
                        setMessage(
                          error instanceof Error ? error.message : "操作失败",
                        );
                        setConflict(
                          error instanceof ApiError && error.code === 90002,
                        );
                      })
                      .finally(() => {
                        lock.current = false;
                        setBusy(false);
                      });
                  }}
                >
                  {busy ? "正在处理…" : "确认"}
                </Button>
              )}
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

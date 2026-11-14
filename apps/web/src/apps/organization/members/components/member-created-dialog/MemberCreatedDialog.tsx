import { Button, Modal } from "@heroui/react";
import type { createMemberResponseSchema } from "@smart-sport/contracts";
import "./MemberCreatedDialog.css";
export function MemberCreatedDialog({
  result,
  onClose,
}: {
  result: ReturnType<typeof createMemberResponseSchema.parse>;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="member-created-dialog">
            <Modal.Header>
              <Modal.Heading>
                {result.accountCreated ? "成员账号已创建" : "组织身份已追加"}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p>
                {result.member.realName} · {result.member.orgName}
              </p>
              <p>登录账号：{result.member.username}</p>
              {result.initialPassword && (
                <>
                  <div className="member-initial-password">
                    <span>初始密码</span>
                    <strong>{result.initialPassword}</strong>
                  </div>
                  <p>请妥善交给该成员。关闭后不再展示，首次登录必须改密。</p>
                </>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button onPress={onClose}>我已记录</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

import { AlertDialog, Button } from "@heroui/react";
import type { TemplateConfirmation as Confirmation } from "../../hooks/use-preset-roles";
import "./TemplateConfirmation.css";

export function TemplateConfirmation({
  value,
  onConfirm,
}: {
  value: Confirmation | null;
  onConfirm: (confirmed: boolean) => void;
}) {
  const reset = value?.kind === "reset";
  return (
    <AlertDialog
      isOpen={Boolean(value)}
      onOpenChange={(open) => {
        if (!open) onConfirm(false);
      }}
    >
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="template-confirmation">
            <AlertDialog.Header>
              <AlertDialog.Heading>
                {reset ? "确认恢复默认？" : "确认保存角色模板？"}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                角色：{value?.role.name}
                {value?.featureName ? ` · ${value.featureName}` : ""}
              </p>
              {reset ? (
                <>
                  <p>
                    当前有 {value?.role.usage.organizationCount} 个组织、
                    {value?.role.usage.userCount} 名用户使用此模板。
                  </p>
                  <p className="template-reset-consequence">
                    {value?.featureName
                      ? "此功能的调整将被清除。"
                      : "此角色的全部权限、数据范围和说明调整将被清除。"}
                    恢复后所有使用此模板的身份立即沿用代码默认设置，已单独调整的自定义角色功能保持不变。
                  </p>
                </>
              ) : (
                <>
                  <p>
                    将影响 {value?.impact?.organizationCount} 个组织、
                    {value?.impact?.userCount} 名用户、
                    {value?.impact?.identityCount} 个身份。
                  </p>
                  {value?.impact?.dataScopeChanged && (
                    <p>默认数据范围也将改变。</p>
                  )}
                  <p>保存后立即生效。自定义角色已单独调整的功能保持不变。</p>
                  <div className="template-impact-menus">
                    {value?.impact?.menuChanges.map((change) => (
                      <div key={change.roleId}>
                        <strong>{change.roleName}</strong>
                        {!!change.added.length && (
                          <p>
                            新增菜单：
                            {change.added
                              .map((menu) => `${menu.module} · ${menu.name}`)
                              .join("、")}
                          </p>
                        )}
                        {!!change.removed.length && (
                          <p>
                            移除菜单：
                            {change.removed
                              .map((menu) => `${menu.module} · ${menu.name}`)
                              .join("、")}
                          </p>
                        )}
                        {!change.added.length && !change.removed.length && (
                          <p>菜单无变化，页面内操作权限仍可能改变。</p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="secondary" onPress={() => onConfirm(false)}>
                取消
              </Button>
              <Button
                variant={reset ? "danger" : "primary"}
                onPress={() => onConfirm(true)}
              >
                {reset ? "确认恢复默认" : "确认保存"}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

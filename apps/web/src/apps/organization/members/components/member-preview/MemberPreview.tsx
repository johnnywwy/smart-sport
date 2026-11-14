import type { AssignableMemberRole, Member } from "@smart-sport/contracts";
import { scopeLabels } from "../../../../../shared/components/role-permissions/permission-state";
import { PreviewMenuTree } from "../../../../../shared/components/role-permissions/preview-menu-tree/PreviewMenuTree";
import { combinedRolePreview } from "../../member-state";
import "./MemberPreview.css";
export function MemberPreview({
  roles,
  identityType,
  incomplete,
  readOnly,
}: {
  roles: readonly AssignableMemberRole[];
  identityType: Member["identityType"];
  incomplete: boolean;
  readOnly: boolean;
}) {
  return (
    <div className="member-preview">
      <strong>{readOnly ? "角色权限摘要" : "保存后 TA 可以"}</strong>
      {incomplete && (
        <p>包含超出当前可分配范围的保留角色，以下仅预览可分配角色的权限。</p>
      )}
      {incomplete && !roles.length ? (
        <p>当前角色的权限详情需由有分配权限的管理员查看。</p>
      ) : (
        <PreviewMenuTree nodes={combinedRolePreview(roles, identityType)} />
      )}
      <p>
        每个动作的数据范围由授予它的角色分别计算。实际可见数据还受组织边界和负责范围限制。
      </p>
      <div className="member-preview-scopes">
        {roles.map((role) => (
          <span key={role.id}>
            {role.name}：{scopeLabels[role.dataScope]}
          </span>
        ))}
      </div>
    </div>
  );
}

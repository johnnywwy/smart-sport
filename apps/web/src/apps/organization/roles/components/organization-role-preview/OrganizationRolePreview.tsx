import type { RoleDetail, SaveRoleGrants } from "@smart-sport/contracts";
import { scopeLabels } from "../../../../../shared/components/role-permissions/permission-state";
import { PreviewMenuTree } from "../../../../../shared/components/role-permissions/preview-menu-tree/PreviewMenuTree";
import { permissionPreviewTree } from "../../../../../shared/components/role-permissions/preview-tree";
import { permissionRole } from "../../role-state";
import "./OrganizationRolePreview.css";

export function OrganizationRolePreview({
  role,
  values,
}: {
  role: RoleDetail;
  values: SaveRoleGrants;
}) {
  return (
    <aside className="organization-role-preview">
      <section>
        <h2>实时预览</h2>
        <p>菜单和按钮权限随左边的设置变化</p>
        <PreviewMenuTree
          nodes={permissionPreviewTree(permissionRole(role), values)}
        />
        <p>
          实际内容还受组织边界、学校类型、服务状态、开通模块和代理商授权限制。
        </p>
      </section>
      <section>
        <h2>能看到哪些数据</h2>
        <p>{scopeLabels[values.dataScope]}</p>
        <p>
          数据范围与本机构的负责范围取交集。未授权查看敏感信息时，证件号和手机号保持脱敏。
        </p>
      </section>
    </aside>
  );
}

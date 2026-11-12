import type { SavePresetRole } from "@smart-sport/contracts";
import { permissionPreviewTree } from "../../preview-tree";
import { type PresetRole, scopeLabels } from "../../template-state";
import { PreviewMenuTree } from "../preview-menu-tree/PreviewMenuTree";
import "./RolePreview.css";

export function RolePreview({
  role,
  values,
}: {
  role: PresetRole;
  values: SavePresetRole;
}) {
  const nodes = permissionPreviewTree(role, values);
  return (
    <aside className="template-preview">
      <section>
        <h2>实时预览</h2>
        <p>展开菜单可查看按钮权限，随左边的设置变化</p>
        <PreviewMenuTree nodes={nodes} />
        <p>
          实际可见内容还受学校类型、学校服务、开通模块、组织边界和代理商授权限制。院系专业仅适用于大学。
        </p>
        <p>未授予查看敏感信息权限时，证件号只显示脱敏后的内容。</p>
      </section>
      <section>
        <h2>保存后会影响谁</h2>
        <p>
          {role.usage.organizationCount} 个组织的 {role.usage.userCount}{" "}
          名用户（{role.usage.identityCount} 个身份）使用此模板。
        </p>
        <p>
          自定义角色单独调整过的功能保持不变；其他功能跟随模板。保存前会再次查询最新影响范围。
        </p>
        <h3>当前数据范围</h3>
        <p>{scopeLabels[values.dataScope]}，仍受组织外边界限制。</p>
      </section>
    </aside>
  );
}

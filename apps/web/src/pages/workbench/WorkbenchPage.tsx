import { moduleCodeSchema } from "@smart-sport/contracts";
import type { ComponentProps } from "react";
import { Navigate, useLocation, useParams } from "react-router";
import { SchoolsPage, SchoolWorkspacePage } from "../../apps/ops/schools";
import { DepartmentsPage } from "../../apps/organization/departments";
import { MembersWorkspace } from "../../apps/organization/members";
import { OrganizationRolesPage } from "../../apps/organization/roles";
import {
  ScopeVisibleCell,
  ScopeWorkspace,
} from "../../apps/organization/scopes";
import { SchoolProfilePage } from "../../apps/school/profiles";
import { PresetRolesPage } from "../../apps/system/preset-roles";
import { ModuleLayout } from "../../layouts/module-layout/ModuleLayout";
import { NavigationState } from "../../shared/components/navigation-state/NavigationState";
import { schoolMenuPermissions } from "../../shared/hooks/school-navigation";
import {
  useAvailableModules,
  useModuleMenus,
} from "../../shared/hooks/use-modules";
import { useSession } from "../../shared/stores/session";
import { PortalKpiGroup } from "../portal/components/portal-kpi-group/PortalKpiGroup";
import { RecentTodos } from "../portal/components/recent-todos/RecentTodos";
import { WelcomePanel } from "../portal/components/welcome-panel/WelcomePanel";
import { WorkbenchRecentVisits } from "./components/workbench-recent-visits/WorkbenchRecentVisits";
import "./WorkbenchPage.css";
export function WorkbenchPage() {
  const { moduleCode, "*": page } = useParams();
  const parsed = moduleCodeSchema.safeParse(moduleCode);
  const identity = useSession((state) => state.currentIdentity);
  const modules = useAvailableModules();
  const menus = useModuleMenus(parsed.success ? parsed.data : undefined);
  const { pathname } = useLocation();
  if (!identity) return <Navigate to="/login" replace />;
  if (modules.isPending || (parsed.success && menus.isPending))
    return <NavigationState state="loading" />;
  if (modules.isError || menus.isError)
    return (
      <NavigationState
        state="error"
        onRetry={() => {
          void modules.refetch();
          void menus.refetch();
        }}
      />
    );
  const module = modules.data.find((item) => item.code === moduleCode);
  if (!parsed.success || !module) return <Navigate to="/modules" replace />;
  if (!page) return <Navigate to={`/m/${module.code}/workbench`} replace />;
  const selected = menus.data
    ?.flatMap((group) => group.children)
    .find((menu) => `/m/${module.code}${menu.path}` === pathname);
  const home = page === "workbench";
  const schoolPermission =
    module.code === "base" && selected
      ? schoolMenuPermissions(selected.key)
      : [];
  const classesMenu = menus.data
    ?.flatMap((group) => group.children)
    .find((menu) => menu.key === "classes");
  const renderVisible: ComponentProps<
    typeof MembersWorkspace
  >["renderVisible"] = (row, onOpen) => (
    <ScopeVisibleCell
      identityId={identity.id}
      targetId={row.id}
      active={row.status === 1 && row.accountStatus === 1}
      onOpen={onOpen}
    />
  );
  const renderMemberScopes = (
    row: Parameters<ComponentProps<typeof MembersWorkspace>["renderScopes"]>[0],
  ) => (
    <ScopeWorkspace
      key={`${identity.id}:${row.id}`}
      identityId={identity.id}
      target={{ kind: "identity", id: row.id, name: row.realName }}
      active={row.status === 1 && row.accountStatus === 1}
    />
  );
  return (
    <ModuleLayout
      module={module}
      modules={modules.data}
      groups={menus.data ?? []}
      identity={identity}
      pageName={home ? "工作台" : (selected?.name ?? "页面不存在")}
      contentPadding={
        selected?.key === "preset-roles" ||
        selected?.key === "roles" ||
        selected?.key === "departments" ||
        selected?.key === "members" ||
        selected?.key === "schools" ||
        schoolPermission.length > 0
          ? "compact"
          : "default"
      }
    >
      {home ? (
        <main className="workbench-page">
          <WelcomePanel identity={identity} />
          <PortalKpiGroup type={identity.type} module={module.code} />
          <div className="workbench-bottom-grid">
            <RecentTodos />
            <WorkbenchRecentVisits
              scope={`${identity.id}:${module.code}`}
              paths={(menus.data ?? []).flatMap((group) =>
                group.children.map((menu) => `/m/${module.code}${menu.path}`),
              )}
            />
          </div>
        </main>
      ) : selected?.key === "schools" &&
        module.code === "base" &&
        (identity.type === "company" || identity.type === "bureau") ? (
        <SchoolsPage
          key={identity.id}
          identity={identity}
          classesPath={classesMenu ? `/m/base${classesMenu.path}` : undefined}
          renderProfile={(school, onBack) => (
            <SchoolProfilePage
              key={`${identity.id}:${school.id}`}
              identityId={identity.id}
              schoolId={school.id}
              regionName={school.regionName}
              platformManaged={false}
              onBack={onBack}
            />
          )}
        />
      ) : selected?.key === "schools" &&
        module.code === "base" &&
        (identity.type === "school" || identity.type === "teacher") ? (
        <SchoolProfilePage
          key={`${identity.id}:${identity.orgId}`}
          identityId={identity.id}
          schoolId={identity.orgId}
          platformManaged
        />
      ) : schoolPermission.length > 0 && identity.type === "company" ? (
        <SchoolWorkspacePage
          key={`${identity.id}:${selected?.key}`}
          identityId={identity.id}
          name={selected?.name ?? "学校业务"}
          permissions={schoolPermission}
        />
      ) : selected?.key === "preset-roles" &&
        module.code === "platform-admin" ? (
        <PresetRolesPage key={identity.id} identityId={identity.id} />
      ) : selected?.key === "departments" && module.code === "base" ? (
        <DepartmentsPage
          key={identity.id}
          identity={identity}
          renderScopes={(row) => (
            <ScopeWorkspace
              key={`${identity.id}:${row.id}`}
              identityId={identity.id}
              target={{ kind: "department", ...row }}
            />
          )}
          renderMembers={({ departmentId, departmentName }) => (
            <MembersWorkspace
              key={`${identity.id}:${departmentId ?? "root"}`}
              identity={identity}
              renderScopes={renderMemberScopes}
              renderVisible={renderVisible}
              {...(departmentId ? { departmentId } : {})}
              departmentName={departmentName}
            />
          )}
        />
      ) : selected?.key === "members" && module.code === "base" ? (
        <MembersWorkspace
          key={identity.id}
          identity={identity}
          renderScopes={renderMemberScopes}
          renderVisible={renderVisible}
        />
      ) : selected?.key === "roles" && module.code === "base" ? (
        <OrganizationRolesPage key={identity.id} identity={identity} />
      ) : (
        <section className="workbench-unavailable">
          <h1>{selected?.name ?? "页面不存在"}</h1>
          <p>
            {selected
              ? "此功能暂未开放。"
              : "当前身份没有此页面的访问权限，请从侧栏选择可用菜单。"}
          </p>
        </section>
      )}
    </ModuleLayout>
  );
}

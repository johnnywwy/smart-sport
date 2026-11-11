import { PortalPanel } from "../portal/components/portal-panel/PortalPanel";
import "./AppEntryPage.css";
import { Button, Card } from "@heroui/react";
import {
  appCodeSchema,
  currentMenusSchema,
  type MenuNode,
} from "@smart-sport/contracts";
import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { PortalLayout } from "../../layouts/portal-layout/PortalLayout";
import {
  useAvailableApps,
  useCurrentMenus,
} from "../../shared/hooks/use-navigation";
import { useRecentVisits } from "../../shared/stores/recent-visits";
import { useSession } from "../../shared/stores/session";
import { PortalState } from "../portal/components/portal-state/PortalState";

function flatten(menus: MenuNode[]): MenuNode[] {
  return menus.flatMap((menu) => [
    menu,
    ...flatten(currentMenusSchema.parse(menu.children)),
  ]);
}
export function AppEntryPage() {
  const { appCode, "*": path } = useParams();
  const parsed = appCodeSchema.safeParse(appCode);
  const identity = useSession((state) => state.currentIdentity);
  const navigate = useNavigate();
  const apps = useAvailableApps();
  const menus = useCurrentMenus(parsed.success ? parsed.data : "system");
  const app = apps.data?.find(({ code }) => code === appCode);
  const selected = flatten(menus.data ?? []).find(
    (menu) => menu.path === `/${path ?? ""}`,
  );
  useEffect(() => {
    if (identity && app && (selected || !path))
      useRecentVisits.getState().record(identity.id, {
        appCode: app.code,
        name: selected?.name ?? app.name,
        path: `/app/${app.code}${selected?.path ?? ""}`,
      });
  }, [identity, app, selected, path]);
  if (!identity) return <Navigate to="/portal" replace />;
  return (
    <PortalLayout identity={identity}>
      <div className="portal-main">
        <Button
          className="portal-back"
          variant="tertiary"
          onPress={() => navigate("/portal")}
        >
          ← 返回门户
        </Button>
        {apps.isPending || menus.isPending ? (
          <PortalState state="loading" />
        ) : apps.isError || menus.isError ? (
          <PortalState
            state="error"
            onRetry={() => {
              void apps.refetch();
              void menus.refetch();
            }}
          />
        ) : !app ? (
          <Card className="portal-state">
            <Card.Title>当前身份无法进入此应用</Card.Title>
            <Card.Description>请返回门户选择可用应用。</Card.Description>
          </Card>
        ) : (
          <>
            <div className="app-entry-introduction">
              <div>
                <p className="app-entry-eyebrow">{app.name}</p>
                <h1>{selected?.name ?? "应用导航"}</h1>
                <p>{app.description}</p>
              </div>
            </div>
            {selected ? (
              <Card className="portal-state">
                <Card.Title>此功能暂未开放</Card.Title>
                <Card.Description>
                  请稍后再试，或先使用其他可用功能。
                </Card.Description>
                <Button
                  variant="secondary"
                  onPress={() => navigate(`/app/${app.code}`)}
                >
                  返回应用导航
                </Button>
              </Card>
            ) : (
              <PortalPanel title="可用功能">
                <div className="portal-menu-grid">
                  {menus.data?.map((menu) => (
                    <Button
                      key={menu.key}
                      className="portal-menu-item"
                      variant="secondary"
                      onPress={() => navigate(`/app/${app.code}${menu.path}`)}
                    >
                      {menu.name}
                      <span aria-hidden="true">↗</span>
                    </Button>
                  ))}
                  {!menus.data?.length && (
                    <p className="text-xs text-[#63636b]">
                      暂无可用菜单，请联系管理员。
                    </p>
                  )}
                </div>
              </PortalPanel>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  );
}

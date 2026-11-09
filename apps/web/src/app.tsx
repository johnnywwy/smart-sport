import { Button, Card, Chip } from "@heroui/react";
import { AppLayout } from "@heroui-pro/react/app-layout";
import { KPI } from "@heroui-pro/react/kpi";
import { KPIGroup } from "@heroui-pro/react/kpi-group";
import { Sidebar } from "@heroui-pro/react/sidebar";
import { useEffect } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const usePreferences = create(
  persist<{
    dark: boolean;
    sidebarOpen: boolean;
    toggleTheme: () => void;
    setSidebarOpen: (open: boolean) => void;
  }>(
    (set) => ({
      dark: window.matchMedia("(prefers-color-scheme: dark)").matches,
      sidebarOpen: true,
      toggleTheme: () => set((state) => ({ dark: !state.dark })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    }),
    { name: "smart-sport-ui" },
  ),
);

const applications = [
  { name: "系统管理", description: "维护学年学期、字典与系统参数" },
  { name: "机构管理", description: "管理组织、学校开通与服务" },
  { name: "组织与权限", description: "维护部门、成员与角色权限" },
  { name: "学校运营", description: "查看负责学校与服务状态" },
  { name: "学校基础数据", description: "维护班级、学生与教师档案" },
];
const metrics = [
  {
    label: "负责学校",
    value: 312,
    history: [284, 290, 289, 301, 305, 308, 312],
  },
  { label: "试用中的学校", value: 12, history: [5, 8, 7, 10, 9, 11, 12] },
  { label: "30 天内到期", value: 7, history: [12, 10, 11, 9, 10, 8, 7] },
  { label: "待审核申请", value: 3, history: [8, 6, 9, 5, 7, 4, 3] },
];

function PortalPreview() {
  const navigate = useNavigate();
  return (
    <div className="workspace space-y-8">
      <div className="space-y-3">
        <Chip size="sm" variant="soft">
          界面预览 · 示例数据
        </Chip>
        <h1 className="text-3xl font-semibold tracking-tight">
          让每一所学校，连接更好的体育教育
        </h1>
        <p className="text-muted">智慧体育云平台 · 工作台</p>
      </div>
      <KPIGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <KPI key={metric.label} className="min-w-0">
            <KPI.Header>
              <KPI.Title>{metric.label}</KPI.Title>
            </KPI.Header>
            <KPI.Content>
              <KPI.Value value={metric.value} />
            </KPI.Content>
            <KPI.Chart
              data={metric.history.map((value) => ({ value }))}
              height={64}
              color="var(--accent)"
            />
            <KPI.Footer>
              <span className="text-xs text-muted">
                示例趋势 · 尚未连接业务接口
              </span>
            </KPI.Footer>
          </KPI>
        ))}
      </KPIGroup>
      <section aria-labelledby="apps-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 id="apps-heading" className="text-xl font-semibold">
            我的应用
          </h2>
          <Chip size="sm" variant="soft">
            5 个规划应用
          </Chip>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {applications.map((app) => (
            <Card key={app.name}>
              <Card.Header>
                <Card.Title>{app.name}</Card.Title>
                <Card.Description>{app.description}</Card.Description>
              </Card.Header>
              <Card.Footer>
                <Chip size="sm" variant="soft">
                  待业务切片接入
                </Chip>
              </Card.Footer>
            </Card>
          ))}
        </div>
      </section>
      <Card>
        <Card.Header>
          <Card.Title>从统一的工作台开始</Card.Title>
          <Card.Description>
            应用入口将在登录、选择组织和权限接口完成后，按当前身份开放。
          </Card.Description>
        </Card.Header>
        <Card.Footer>
          <Button
            variant="secondary"
            onPress={() => navigate("/preview/workspace")}
          >
            预览应用布局
          </Button>
        </Card.Footer>
      </Card>
    </div>
  );
}

function WorkspacePreview() {
  return (
    <div className="workspace space-y-6">
      <Chip variant="soft" size="sm">
        界面预览
      </Chip>
      <h1 className="text-3xl font-semibold">应用工作区</h1>
      <Card>
        <Card.Header>
          <Card.Title>为学校管理准备的统一空间</Card.Title>
          <Card.Description>
            侧栏支持展开、收起与窄屏抽屉；主题和侧栏偏好会保留。
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <p className="text-muted">
            业务页面将按 docs
            中的功能切片接入。当前未连接认证、学校数据或权限接口。
          </p>
        </Card.Content>
      </Card>
    </div>
  );
}

export function App() {
  const { dark, sidebarOpen, toggleTheme, setSidebarOpen } = usePreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const isWorkspace = location.pathname === "/preview/workspace";
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);
  return (
    <AppLayout
      navigate={navigate}
      sidebarOpen={sidebarOpen}
      onSidebarOpenChange={setSidebarOpen}
      sidebar={
        isWorkspace ? (
          <Sidebar>
            <Sidebar.Header>
              <span className="px-2 py-3 font-semibold">智慧体育</span>
            </Sidebar.Header>
            <Sidebar.Content>
              <Sidebar.Menu aria-label="预览导航">
                <Sidebar.MenuItem
                  id="portal"
                  textValue="模块门户"
                  href="/preview/portal"
                >
                  <Sidebar.MenuItemContent>
                    <Sidebar.MenuLabel>模块门户</Sidebar.MenuLabel>
                  </Sidebar.MenuItemContent>
                </Sidebar.MenuItem>
                <Sidebar.MenuItem
                  id="workspace"
                  textValue="应用工作区"
                  href="/preview/workspace"
                  isCurrent
                >
                  <Sidebar.MenuItemContent>
                    <Sidebar.MenuLabel>应用工作区</Sidebar.MenuLabel>
                  </Sidebar.MenuItemContent>
                </Sidebar.MenuItem>
              </Sidebar.Menu>
            </Sidebar.Content>
          </Sidebar>
        ) : null
      }
      navbar={
        <div className="flex w-full items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3">
            {isWorkspace && <Sidebar.Trigger aria-label="展开或收起侧栏" />}
            <span className="font-semibold">智慧体育云平台</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onPress={toggleTheme}
            aria-label={dark ? "切换浅色主题" : "切换深色主题"}
          >
            {dark ? "浅色主题" : "深色主题"}
          </Button>
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Navigate to="/preview/portal" replace />} />
        <Route path="/preview/portal" element={<PortalPreview />} />
        <Route path="/preview/workspace" element={<WorkspacePreview />} />
        <Route
          path="*"
          element={
            <div className="workspace">
              <Card>
                <Card.Header>
                  <Card.Title>页面不存在</Card.Title>
                </Card.Header>
                <Card.Footer>
                  <Button onPress={() => navigate("/preview/portal")}>
                    返回预览
                  </Button>
                </Card.Footer>
              </Card>
            </div>
          }
        />
      </Routes>
    </AppLayout>
  );
}

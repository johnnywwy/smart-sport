import { Sidebar } from "@heroui-pro/react/sidebar";

export function AppSidebar() {
  return (
    <Sidebar>
      <Sidebar.Header>
        <span className="px-2 py-3 font-semibold">智慧体育</span>
      </Sidebar.Header>
      <Sidebar.Content>
        <Sidebar.Menu aria-label="预览导航">
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
  );
}

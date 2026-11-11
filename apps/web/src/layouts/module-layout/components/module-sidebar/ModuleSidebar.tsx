import { Button, Dropdown, Label } from "@heroui/react";
import { Sidebar } from "@heroui-pro/react/sidebar";
import type { AvailableModule, ModuleMenuGroup } from "@smart-sport/contracts";
import { useNavigate } from "react-router";
import { BrandMark } from "../../../../shared/components/brand-mark/BrandMark";
import "./ModuleSidebar.css";
export function ModuleSidebar({
  module,
  modules,
  groups,
  pathname,
}: {
  module: AvailableModule;
  modules: AvailableModule[];
  groups: ModuleMenuGroup[];
  pathname: string;
}) {
  const navigate = useNavigate();
  const root = `/m/${module.code}`;
  return (
    <Sidebar className="module-sidebar">
      <Sidebar.Header>
        <div className="module-sidebar-brand">
          <BrandMark />
          <span>智慧体育云平台</span>
        </div>
      </Sidebar.Header>
      <Sidebar.Content>
        <Sidebar.Menu aria-label="工作台导航">
          <Sidebar.MenuItem
            id="workbench"
            textValue="工作台"
            href={`${root}/workbench`}
            isCurrent={pathname === `${root}/workbench`}
          >
            <Sidebar.MenuItemContent>
              <Sidebar.MenuIcon>
                <span aria-hidden="true">⌂</span>
              </Sidebar.MenuIcon>
              <Sidebar.MenuLabel>工作台</Sidebar.MenuLabel>
            </Sidebar.MenuItemContent>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
        {groups.map((group) => (
          <Sidebar.Group key={group.key}>
            <Sidebar.GroupLabel>{group.name}</Sidebar.GroupLabel>
            <Sidebar.Menu aria-label={group.name}>
              {group.children.map((menu) => (
                <Sidebar.MenuItem
                  key={menu.key}
                  id={menu.key}
                  textValue={menu.name}
                  href={`${root}${menu.path}`}
                  isCurrent={pathname === `${root}${menu.path}`}
                >
                  <Sidebar.MenuItemContent>
                    <Sidebar.MenuIcon>
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <rect x="4" y="4" width="12" height="12" rx="3" />
                        <path d="M7 8h6M7 12h4" />
                      </svg>
                    </Sidebar.MenuIcon>
                    <Sidebar.MenuLabel>{menu.name}</Sidebar.MenuLabel>
                  </Sidebar.MenuItemContent>
                </Sidebar.MenuItem>
              ))}
            </Sidebar.Menu>
          </Sidebar.Group>
        ))}
      </Sidebar.Content>
      <Sidebar.Footer>
        <Dropdown>
          <Button
            className="module-switcher"
            variant="tertiary"
            aria-label="切换模块"
          >
            {module.name}
            <span aria-hidden="true">⌃</span>
          </Button>
          <Dropdown.Popover>
            <Dropdown.Menu
              aria-label="可用模块"
              onAction={(key) =>
                navigate(key === "all" ? "/modules" : `/m/${key}/workbench`)
              }
            >
              {modules.map((item) => (
                <Dropdown.Item
                  key={item.code}
                  id={item.code}
                  textValue={item.name}
                >
                  <Label>{item.name}</Label>
                </Dropdown.Item>
              ))}
              <Dropdown.Item id="all" textValue="查看全部模块">
                <Label>查看全部模块</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
        <span className="module-switcher-hint">切换模块</span>
      </Sidebar.Footer>
    </Sidebar>
  );
}

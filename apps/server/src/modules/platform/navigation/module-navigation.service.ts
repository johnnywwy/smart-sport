import { Inject, Injectable } from "@nestjs/common";
import {
  type AppCode,
  appDefinitions,
  availableModulesSchema,
  type ModuleCode,
  type ModuleMenu,
  moduleDefinitions,
  moduleMenusSchema,
} from "@smart-sport/contracts";
import { ClsService } from "nestjs-cls";
import { ApiException } from "../../../api-response.js";
import type { IdentityContext } from "../identity-context/index.js";
import { NavigationService } from "./navigation.service.js";

@Injectable()
export class ModuleNavigationService {
  constructor(
    @Inject(NavigationService) private readonly navigation: NavigationService,
    @Inject(ClsService) private readonly cls: ClsService,
  ) {}

  async available() {
    const rows = await Promise.all(
      moduleDefinitions.map(async (module) => {
        const groups = await this.current(module.code);
        const menus = groups.flatMap(({ children }) => children);
        return {
          code: module.code,
          name: module.name,
          description: module.description,
          icon: module.icon,
          sort: module.sort,
          menuPreview: menus.slice(0, 7).map(({ name }) => name),
          menuCount: menus.length,
        };
      }),
    );
    return availableModulesSchema.parse(
      rows.filter(({ menuCount }) => menuCount > 0),
    );
  }

  async current(code: ModuleCode) {
    const context = this.cls.get<IdentityContext | undefined>(
      "identityContext",
    );
    if (!context) throw new ApiException(10005);
    const module = moduleDefinitions.find((item) => item.code === code);
    if (
      !module ||
      !(module.identityTypes as readonly string[]).includes(
        context.identityType,
      )
    )
      return [];
    const appCodes = [
      ...new Set(
        module.groups.flatMap(({ menus }) =>
          menus.flatMap(({ features }) => features.map(({ app }) => app)),
        ),
      ),
    ];
    // 复用已验证的应用、功能、菜单启停与覆盖过滤，避免仅凭权限码展示已隐藏菜单。
    const sources = new Map(
      await Promise.all(
        appCodes.map(
          async (app) => [app, await this.navigation.current({ app })] as const,
        ),
      ),
    );
    const groups = module.groups
      .map((group, groupIndex) => ({
        key: group.key,
        name: group.name,
        sort: (groupIndex + 1) * 10,
        children: group.menus
          .flatMap((menu, menuIndex): ModuleMenu[] => {
            const candidates = menu.features.flatMap((ref) => {
              const declaration = appDefinitions.find(
                ({ code }) => code === ref.app,
              );
              const declaredKeys = new Set(
                declaration?.menus
                  .filter(({ feature }) => feature === ref.feature)
                  .map(({ key }) => key),
              );
              const visible = sources.get(ref.app as AppCode) ?? [];
              return visible
                .filter(({ key }) => declaredKeys.has(key))
                .map((source) => {
                  const original = declaration?.menus.find(
                    ({ key }) => key === source.key,
                  );
                  return { source, original };
                });
            });
            if (!candidates.length) return [];
            const overridden = candidates.find(
              ({ source, original }) =>
                source.name !== original?.name ||
                source.icon !== original?.icon ||
                source.sort !== original?.sort,
            );
            return [
              {
                key: menu.key,
                name:
                  overridden &&
                  overridden.source.name !== overridden.original?.name
                    ? overridden.source.name
                    : menu.name,
                path: menu.path,
                icon:
                  overridden &&
                  overridden.source.icon !== overridden.original?.icon
                    ? overridden.source.icon
                    : menu.icon,
                sort:
                  overridden &&
                  overridden.source.sort !== overridden.original?.sort
                    ? overridden.source.sort
                    : (menuIndex + 1) * 10,
              },
            ];
          })
          .sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key)),
      }))
      .filter(({ children }) => children.length);
    return moduleMenusSchema.parse(groups);
  }
}

import { Inject, Injectable } from "@nestjs/common";
import {
  type AppDefinition,
  appDefinitions,
  availableAppsSchema,
  type CurrentMenusQuery,
  currentMenusSchema,
} from "@smart-sport/contracts";
import { buildMenuTree } from "@smart-sport/domain";
import { ClsService } from "nestjs-cls";
import { ApiException } from "../../../api-response.js";
import type { IdentityContext } from "../identity-context/index.js";
import { SubscriptionStateService } from "../subscription/index.js";
import { NavigationRepository } from "./navigation.repository.js";

@Injectable()
export class NavigationService {
  constructor(
    @Inject(NavigationRepository)
    private readonly repository: NavigationRepository,
    @Inject(ClsService) private readonly cls: ClsService,
    @Inject(SubscriptionStateService)
    private readonly subscriptions: SubscriptionStateService,
  ) {}

  /** 当前身份至少有一个启用功能的查看权限时，门户才展示该应用。 */
  async available() {
    const context = this.context();
    const { permissions, exportOnly } =
      await this.subscriptions.ownPermissions(context);
    const [apps, features] = await Promise.all([
      this.repository.apps(),
      this.repository.features(),
    ]);
    return availableAppsSchema.parse(
      apps
        .filter((app) => {
          const declared: AppDefinition | undefined = appDefinitions.find(
            ({ code }) => code === app.code,
          );
          return (
            declared?.identityTypes.includes(context.identityType) &&
            app.identityTypes.includes(context.identityType) &&
            features.some(
              (feature) =>
                feature.appCode === app.code &&
                declared.features[feature.code]?.actions.includes("view") &&
                feature.actions.includes("view") &&
                (permissions.has(`${app.code}:${feature.code}:view`) ||
                  (exportOnly &&
                    permissions.has(`${app.code}:${feature.code}:export`))),
            )
          );
        })
        .sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code)),
    );
  }

  /** 菜单只读取声明内的已启用条目，并应用用户的显示覆盖。 */
  async current(query: CurrentMenusQuery) {
    if (!(await this.available()).some(({ code }) => code === query.app))
      return [];
    const context = this.context();
    const { permissions, exportOnly } =
      await this.subscriptions.ownPermissions(context);
    const declared: AppDefinition | undefined = appDefinitions.find(
      ({ code }) => code === query.app,
    );
    const rows = await this.repository.menus(query.app, context.client);
    const visible = rows.filter(
      ({ menu, override }) =>
        !override?.hidden &&
        declared?.menus.some(
          (item) => item.key === menu.key && item.feature === menu.featureCode,
        ) &&
        (permissions.has(`${query.app}:${menu.featureCode}:view`) ||
          (exportOnly &&
            permissions.has(`${query.app}:${menu.featureCode}:export`))),
    );
    return currentMenusSchema.parse(
      buildMenuTree(
        visible.map(({ menu, override }) => ({
          key: menu.key,
          parentKey: menu.parentKey,
          name: override?.displayName ?? menu.name,
          path: menu.path,
          icon: override?.icon ?? menu.icon,
          sort: override?.sort ?? menu.sort,
        })),
      ),
    );
  }

  private context() {
    const context = this.cls.get<IdentityContext | undefined>(
      "identityContext",
    );
    if (!context) throw new ApiException(10005);
    return context;
  }
}

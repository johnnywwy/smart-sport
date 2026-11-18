import "reflect-metadata";
import type { ExecutionContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ClsModule, ClsService } from "nestjs-cls";
import { beforeAll, describe, expect, it } from "vitest";
import {
  PermissionGuard,
  RequireAnyPermissions,
  RequirePermissions,
} from "../../src/core/permission.guard.js";

@RequirePermissions("platform:org:view")
class ProtectedController {
  @RequirePermissions("platform:org:create", "platform:org:update")
  write() {}
  list() {}
}
@RequirePermissions("platform:org:view")
@RequireAnyPermissions("org:audit:view", "system:audit:view")
class AlternativeController {
  @RequireAnyPermissions("org:role:view", "system:preset-role:view")
  read() {}
}
class GlobalController {
  read() {}
}
let guard: PermissionGuard;
let cls: ClsService;
beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [ClsModule.forRoot()],
    providers: [PermissionGuard],
  }).compile();
  guard = module.get(PermissionGuard);
  cls = module.get(ClsService);
});
const route = (
  controller:
    | typeof ProtectedController
    | typeof GlobalController
    | typeof AlternativeController,
  handler: () => void,
) =>
  ({
    getClass: () => controller,
    getHandler: () => handler,
  }) as unknown as ExecutionContext;
const write = route(ProtectedController, ProtectedController.prototype.write);
const list = route(ProtectedController, ProtectedController.prototype.list);
const context = (...permissions: string[]) => ({
  identityContext: {
    permissions: new Map(permissions.map((code) => [code, "personal"])),
  },
});

describe("功能权限守卫", () => {
  it("未声明功能权限的全局接口交由身份鉴权处理", () => {
    cls.runWith({}, () =>
      expect(
        guard.canActivate(
          route(GlobalController, GlobalController.prototype.read),
        ),
      ).toBe(true),
    );
  });
  it("有权限标记但缺少已验证上下文时拒绝访问", () => {
    cls.runWith({}, () =>
      expect(() => guard.canActivate(list)).toThrow(
        expect.objectContaining({ code: 11101 }),
      ),
    );
  });
  it("类上的权限要求适用于没有方法标记的接口", () => {
    cls.runWith(context("platform:org:view"), () =>
      expect(guard.canActivate(list)).toBe(true),
    );
    cls.runWith(context("platform:org:create"), () =>
      expect(() => guard.canActivate(list)).toThrow(
        expect.objectContaining({ code: 11101 }),
      ),
    );
  });
  it("类和方法要求累加，缺任意一个都不能放行", () => {
    const required = [
      "platform:org:view",
      "platform:org:create",
      "platform:org:update",
    ];
    for (const omitted of required) {
      cls.runWith(context(...required.filter((code) => code !== omitted)), () =>
        expect(() => guard.canActivate(write)).toThrow(
          expect.objectContaining({ code: 11101 }),
        ),
      );
    }
    cls.runWith(context(...required), () =>
      expect(guard.canActivate(write)).toBe(true),
    );
  });
});

it("任一权限组可择一满足，类与方法各组和固定权限都不能被绕过", () => {
  const target = route(
    AlternativeController,
    AlternativeController.prototype.read,
  );
  for (const granted of [
    ["platform:org:view", "org:audit:view", "org:role:view"],
    ["platform:org:view", "system:audit:view", "system:preset-role:view"],
  ])
    cls.runWith(context(...granted), () =>
      expect(guard.canActivate(target)).toBe(true),
    );
  for (const granted of [
    [],
    ["org:audit:view", "org:role:view"],
    ["platform:org:view", "org:audit:view"],
    ["platform:org:view", "org:role:view"],
  ])
    cls.runWith(context(...granted), () =>
      expect(() => guard.canActivate(target)).toThrow(
        expect.objectContaining({ code: 11101 }),
      ),
    );
});

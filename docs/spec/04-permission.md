# 04 · 应用、功能模块与角色

## 1. 目标

管理员不懂权限码也能配好角色：内置角色开箱即用；按“功能模块 × 四档”配置；菜单与权限码以代码为准。

## 2. 三层结构

```
应用 app（门户卡片）
 └─ 功能模块 feature（四档：无 / 查看 / 编辑 / 管理）
     └─ 动作 action（查 view · 增 create · 改 update · 删 delete · 导入 import · 导出 export）
          → 权限码 `{app}:{feature}:{action}`
```

| 档位          | 包含动作                 |
| ------------- | ------------------------ |
| 无 none       | —                        |
| 查看 view     | view                     |
| 编辑 edit     | view、create、update     |
| 管理 manage   | 该功能模块声明的全部动作 |
| 自定义 custom | 单独勾选的动作           |

每个功能模块只声明自己用到的动作，例如“学年学期”没有导入导出。

另有两个扩展动作，只在需要的功能模块中声明，并归入“管理”档（自定义档位时可单独勾选）：

| 动作                     | 用于                           |
| ------------------------ | ------------------------------ |
| `approve` 审核           | 学校服务开通审核、转学确认     |
| `sensitive` 查看敏感信息 | 学生、教师的证件号与手机号全文 |

## 3. M1 应用与功能模块

| 应用                  | 可用身份                           | 功能模块（动作）                                                                                                                                                                                                                                                                                                        |
| --------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `system` 系统管理     | company                            | `dict` 数据字典（查增改删）· `param` 系统参数（查改）· `number` 编号规则（查改）· `academic` 学年学期（查增改）· `region` 行政区划（查导入）· `menu` 菜单显示（查改）· `preset-role` 内置角色（查）· `audit` 全平台审计（查导出）                                                                                       |
| `platform` 机构管理   | company                            | `org` 组织（查增改导出）· `onboarding` 学校开通（查增改）· `subscription` 服务与应用（查增改导出审核）· `grant` 代理商授权总览（查导出）                                                                                                                                                                                |
| `org` 组织与权限      | company · bureau · agent · school  | `department` 部门（查增改删）· `member` 成员与身份（查增改删导入导出）· `role` 角色（查增改删）· `audit` 本组织审计（查导出）                                                                                                                                                                                           |
| `ops` 学校运营        | company · bureau · agent           | `school` 学校列表（查导出）                                                                                                                                                                                                                                                                                             |
| `school` 学校基础数据 | school · teacher · company · agent | `profile` 学校档案（查改）· `class` 行政班（查增改删导入导出）· `teaching-class` 教学班（同上）· `college` 院系（查增改删）· `student` 学生（查增改删导入导出、敏感）· `teacher` 教师与任课（查增改删导入导出、敏感）· `rollover` 学年切换（查改）· `transfer` 转学（查增改审核）· `agent-grant` 代理商授权（查增改删） |

不属于任何应用、登录即可用的全局功能：门户、待办、消息、任务中心、个人中心（改密、会话）。

> company、agent 身份要先在“学校运营”中选择学校，才能进入“学校基础数据”。

## 4. 代码声明（以代码为准）

`packages/contracts/src/apps/*.ts` 声明应用、功能模块、动作、菜单与内置角色档位：

```ts
export const schoolApp = defineApp({
  code: "school",
  name: "学校基础数据",
  icon: "school",
  identityTypes: ["school", "teacher", "company", "agent"],
  features: {
    student: {
      name: "学生",
      actions: ["view", "create", "update", "delete", "import", "export"],
    },
    // …
  },
  menus: [
    {
      key: "students",
      name: "学生管理",
      path: "/students",
      feature: "student",
    },
    // …
  ],
});
```

部署时 migrate 任务同步到 `apps`、`features`、`menus` 表：新增插入、删除的标记下线、已有的更新；后台改过的显示名称、排序、图标、显隐单独存在 `menu_overrides`，不被覆盖。

## 5. 数据

| 表               | 关键字段                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps`           | code、name、icon、identity_types[]、sort、status                                                                                                                                                     |
| `features`       | app_code、code、name、actions[]                                                                                                                                                                      |
| `menus`          | app_code、parent_key、key、name、path、icon、feature、client（admin · mobile）、sort                                                                                                                 |
| `menu_overrides` | menu_key、display_name、sort、icon、hidden                                                                                                                                                           |
| `roles`          | kind（preset · custom）、base_role_id、identity_type、org_id（空为内置）、code（系统生成）、name、data_scope（all · dept_and_below · dept · personal；student 固定 self，parent 固定 child）、remark |
| `role_grants`    | (role_id, app_code, feature_code)、level、actions[]（level=custom 时）                                                                                                                               |

内置角色的档位以代码为准，`role_grants` 只存自定义角色与其基础角色不同的行。

## 6. 内置角色

| 身份    | 角色         | 默认数据范围 | 主要档位                                      | 默认分配             |
| ------- | ------------ | ------------ | --------------------------------------------- | -------------------- |
| company | 超级管理员   | 本机构全部   | 全部管理                                      | 手动                 |
| company | 研发人员     | 本机构全部   | system 管理、platform 查看、ops/school 查看   | 研发部               |
| company | 销售         | 本部门及以下 | platform.subscription 编辑、ops 查看          | 销售部               |
| company | 技术服务     | 本部门及以下 | ops 查看、school 编辑                         | 技术服务部           |
| company | 生产         | 本部门及以下 | ops 查看                                      | 生产部               |
| company | 只读审计     | 本机构全部   | 全部查看                                      | 手动                 |
| bureau  | 局管理员     | 本机构全部   | org 管理、ops 查看                            | 新建教育局的首个账号 |
| bureau  | 业务科员     | 本机构全部   | ops 查看                                      | 默认                 |
| bureau  | 领导查看     | 本机构全部   | ops 查看                                      | 手动                 |
| agent   | 代理商管理员 | 本机构全部   | org 管理、ops 查看、school 编辑（受授权上限） | 新建代理商的首个账号 |
| agent   | 代理商运营   | 本机构全部   | ops 查看、school.class/student 编辑           | 默认                 |
| school  | 学校管理员   | 本机构全部   | org 管理、school 管理                         | 开通学校的首个账号   |
| school  | 体育组长     | 本机构全部   | school 编辑（不含 profile、agent-grant）      | 手动                 |
| teacher | 体育教师     | 本人负责     | school.class/teaching-class/student 查看      | 新建教师             |
| teacher | 班主任       | 本人负责     | school.student 编辑                           | 设为班主任时叠加     |
| teacher | 年级组长     | 本部门       | school.class/student 查看                     | 手动                 |

赛事、中考等上层应用上线时，在代码中给内置角色补档位，不需要管理员操作。

## 7. 接口

| 方法        | 路径                  | 权限                          | 说明                                               |
| ----------- | --------------------- | ----------------------------- | -------------------------------------------------- |
| GET         | `/apps/available`     | 登录                          | 当前身份在门户上可见的应用                         |
| GET         | `/menus/current?app=` | 登录                          | 某应用的菜单树（已按权限、学校开通情况过滤）       |
| GET         | `/roles?identityType` | `org:role:view`               | 本组织可用角色（内置 + 本组织自定义）              |
| GET         | `/roles/:id`          | `org:role:view`               | 含每个功能模块的最终档位与“是否已调整”             |
| POST        | `/roles`              | `org:role:create`             | `{ name, baseRoleId, dataScope }`，code 自动生成   |
| PUT         | `/roles/:id/grants`   | `org:role:update`             | 整体提交档位；只存差异                             |
| POST        | `/roles/:id/reset`    | `org:role:update`             | 恢复为基础角色                                     |
| GET         | `/roles/:id/preview`  | `org:role:view`               | 该角色可见的应用与菜单、按当前组织估算的可见数据量 |
| GET / PATCH | `/menus/overrides`    | `system:menu:view` / `update` | 菜单显示调整                                       |

## 8. 分级管理

1. 只能管理本组织的成员与自定义角色；公司超管可管理所有组织。
2. 上级教育局管理员可为下级教育局开通首个管理员。
3. **不高于自己**：分配或编辑角色时，每个功能模块的档位不能超过操作人的档位；数据范围不能比操作人更宽。
4. 不能修改自己的角色；每个组织至少保留一名在 `org:member` 与 `org:role` 上都为“管理”档的成员。
5. 内置角色不可编辑、不可删除；只能“基于它另存为自定义角色”。
6. 角色正在被使用时不能删除，需先替换。

## 9. 权限计算

```
身份权限码 = ⋃（每个角色：每个功能模块的最终档位 → 动作 → 权限码），每个权限码记录授予它的角色中最宽的数据范围
请求某学校时实际权限 = 身份权限码
                    ∩ 该学校已开通应用的权限码（学校类身份、以及 company/agent 进入学校时）
                    ∩ 代理商授权上限（agent 身份）
                    ∩ 服务状态限制（宽限期只保留 view、export）
```

## 10. 错误码

| 码    | 含义                   |
| ----- | ---------------------- |
| 11101 | 缺少权限               |
| 11102 | 分配的角色超出你的权限 |
| 11103 | 不能修改自己的角色     |
| 11104 | 组织至少保留一名管理员 |
| 11105 | 内置角色不可修改       |
| 11106 | 角色正在使用，不能删除 |

## 11. 验收标准

- 新建研发部员工自动获得“研发人员”角色，进入门户只看到其可用应用。
- 学校管理员无法创建档位高于自己的自定义角色。
- 代码新增一个功能模块并发布后，内置角色立即按代码档位生效；自定义角色未调整该模块时跟随基础角色。
- 后台改过的菜单名称在下次发布后保持不变。

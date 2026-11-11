# 16 · 前后端代码架构规范

## 1. 目标

前端组件化、后端模块化。每一块代码职责单一、边界清楚、可以单独测试和替换；新增一个业务模块（如跳绳）时，照同样的结构往里加，不需要改动已有模块。

共同原则：

| 原则       | 含义                                                                 |
| ---------- | -------------------------------------------------------------------- |
| 单一职责   | 一个文件、一个组件、一个类只做一件事                                 |
| 单向依赖   | 上层依赖下层，下层不知道上层；同层之间通过公开接口交互               |
| 复用优先   | 写之前先找有没有现成的通用组件或基类；同样的逻辑出现第二次就抽出来   |
| 契约共享   | 类型、校验、权限码、错误码只在 `packages/contracts` 定义一次         |
| 纯函数下沉 | 不依赖数据库和框架的计算（年级、档位、范围合并）放 `packages/domain` |

## 2. 包之间的依赖方向

```
apps/web ─┐
apps/server ─┼─> packages/contracts ─> （无内部依赖）
apps/worker ─┘        ▲
      └────────> packages/domain ─> packages/contracts
```

- `contracts`、`domain` 不能依赖任何 app，也不能依赖 NestJS、React、Drizzle。
- `web` 不能引用 `server` 的代码，反之亦然；共用的东西只能放进 `contracts` 或 `domain`。
- `worker` 可以复用 `server` 中导出的模块（通过 `apps/server` 的公开入口）。

## 3. 后端：模块化

### 3.1 目录

```
apps/server/src/
├─ core/          横切：guards · decorators · interceptors · filters · cls · exceptions
├─ infra/         基础设施：database · tenant · redis · queue · storage · crypto
└─ modules/
   ├─ platform/   auth · identity · org · permission · scope · subscription · academic · dict · audit
   ├─ school/     school-base（classes · students · teachers …）· student-index
   └─ foundation/ import-export · task · file · todo · notify · outbox · recycle · number
```

依赖方向：`modules → infra → core`。`core`、`infra` 不能引用 `modules`。

### 3.2 一个功能模块的文件

以学生为例：

```
modules/school/students/
├─ students.module.ts        装配：声明 controller、provider、导出
├─ students.controller.ts    HTTP 层
├─ students.service.ts       业务层
├─ students.repository.ts    数据层
├─ students.mapper.ts        表行 ↔ 契约对象的转换
├─ students.import.ts        导入模板处理器（有导入时）
├─ index.ts                  模块对外公开的内容
└─ __tests__/                students.service.spec.ts · students.e2e.spec.ts
```

### 3.3 三层各自的职责

| 层         | 只做什么                                                                                | 不能做什么                                               |
| ---------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Controller | 声明路由、权限装饰器、`@SchoolScoped()`、用契约 schema 校验入参、调用 Service、返回结果 | 写业务判断、直接查数据库、拼响应格式（由拦截器统一处理） |
| Service    | 业务规则、事务边界、调用其他模块的 Service、写审计、发 outbox 事件                      | 接触 `req` / `res`、写 SQL 或 Drizzle 查询               |
| Repository | Drizzle 查询、`scopeFilter`、乐观锁、软删除                                             | 业务判断、调用其他模块、抛业务以外的 HTTP 异常           |

- Controller 方法一般不超过 10 行；出现 `if` 业务分支说明逻辑该下沉到 Service。
- Repository 继承 `infra/database` 的仓储基类（公共字段、`updateWithVersion`、软删除），不重复实现。
- Repository 返回表行；Service 经 `mapper` 转成契约对象后返回，不把表行直接返回给前端。

### 3.4 模块之间

- 模块只通过对方 `index.ts` 导出的 **Service** 交互；禁止引用其他模块的 Repository、表定义之外的内部文件。
- 禁止循环依赖。两个模块互相需要对方时，把共用部分下沉，或者用 outbox 事件解耦（如“学生状态变化 → 更新学生索引”）。
- 横切需求（鉴权、数据范围、审计、幂等、限流）用 `core` 里的守卫、装饰器、拦截器实现，业务代码里不复制粘贴这些逻辑。

### 3.5 其他约定

| 项     | 约定                                                                                     |
| ------ | ---------------------------------------------------------------------------------------- |
| 错误   | 抛 `BizException(错误码)`，错误码来自 contracts；不抛字符串，不在 Service 里拼 HTTP 响应 |
| 配置   | 只通过配置模块读取；业务代码里不直接读 `process.env`                                     |
| 上下文 | 当前身份、学校、traceId 从 CLS 取，不层层传参                                            |
| 事务   | 在 Service 开启，通过参数把 `tx` 传给 Repository                                         |
| 命名   | 文件 `kebab-case`；类 `PascalCase`；表与列 `snake_case`；接口路径复数短横线              |
| 体量   | 单文件建议不超过 300 行，单函数不超过 50 行；超过就拆                                    |
| 注释   | 写“为什么”，不写“做了什么”；公开的 Service 方法写一行用途说明                            |
| 测试   | Service 的业务规则用单元测试；接口用集成测试（真实 PostgreSQL）                          |

### 3.6 新增一个后端功能的固定步骤

1. contracts：请求、响应 schema、错误码、权限声明。
2. 迁移 SQL 与表定义。
3. Repository → Service → Controller。
4. 集成测试：成功、无权限（403）、越范围（404）。

## 4. 前端：组件化

### 4.1 目录与四层组件

```
apps/web/src/
├─ app/                 应用装配：providers · router
├─ layouts/             AppLayout（门户与工作区外壳）
├─ pages/               不属于任何应用的页面：login · select-org · portal · 403 · 404
├─ shared/
│  ├─ ui/               ① 基础组件：对 HeroUI 的薄封装与统一样式
│  ├─ components/       ② 通用业务组件：DataTable · SchemaForm · ScopePicker · ImportWizard · MaskedField · Can
│  ├─ hooks/            通用 hooks：usePermission · useCurrentSchool · usePagination
│  ├─ api/              API 客户端
│  └─ stores/           zustand：session · school · academic
└─ apps/                按应用 → 功能模块组织
   └─ school/
      └─ students/
         ├─ pages/        ④ 页面：StudentListPage.tsx · StudentDetailPage.tsx
         ├─ components/   ③ 功能组件：StudentForm.tsx · StudentTransferDialog.tsx
         ├─ hooks/        useStudents.ts（数据请求与变更）
         ├─ columns.tsx   列表列定义
         └─ index.ts      导出路由与页面
```

| 层                                 | 是什么                                   | 规则                                                        |
| ---------------------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| ① 基础组件 `shared/ui`             | 按钮、输入框、弹层等，对 HeroUI 的薄封装 | 不含业务、不发请求、不读全局状态                            |
| ② 通用业务组件 `shared/components` | 所有应用都会用的组合组件                 | 不认识具体业务（学生、班级）；通过 props 与契约 schema 配置 |
| ③ 功能组件 `apps/*/*/components`   | 某个功能模块专用                         | 只在本功能模块内使用                                        |
| ④ 页面 `pages`                     | 路由对应的页面                           | 只负责组合组件和布局，不写复杂逻辑                          |

依赖方向：④ → ③ → ② → ①，不能反向；功能模块之间不互相引用。

### 4.2 组件规则

- **一个文件一个组件**，文件名与组件名一致（`PascalCase.tsx`）。
- **展示与数据分离**：组件通过 props 接收数据和回调；请求数据写在 `hooks/` 的 `useXxx` 里（TanStack Query），组件内不直接调用 API 客户端。
- **列表一律用 `DataTable`，表单一律用 `SchemaForm`，导入一律用 `ImportWizard`**，不手写表格、分页、校验。它们不满足需求时，先扩展通用组件，而不是在页面里另写一套。
- **抽取时机**：同一段界面或逻辑在第二个功能模块里出现，就上移到 `shared`；只用一次的不提前抽象。
- **体量**：单个组件建议不超过 200 行；超过就拆成子组件或把逻辑移到 hook。
- **props**：必须有 TypeScript 类型；不超过 8 个左右，过多说明组件职责太多；不用 `any`。
- **状态放哪**：服务端数据放 TanStack Query；跨页面的会话信息放 zustand；只在一个组件内用的放 `useState`；能从已有数据算出来的不再存一份。
- **样式**：用 Tailwind 类和主题变量；不写行内 `style`，不写死颜色值；间距、圆角、字号用统一的设计变量。
- **权限**：按钮显隐用 `<Can>` 和行的 `allowedActions`，不在组件里手写权限判断。
- **文案**：界面文字用中文，同一概念在各处叫法一致（以 ARCHITECTURE 的术语表为准）。
- **加载、空、错误三种状态** 每个列表和详情页都要处理，使用通用的占位组件。

### 4.3 新增一个前端功能的固定步骤

1. 在 `apps/<应用>/<功能>/` 下建目录。
2. `hooks/`：基于 contracts 写查询与变更 hook（key 含身份 id 与学校 id）。
3. `columns.tsx` + `pages/XxxListPage.tsx`：用 `DataTable`。
4. `components/XxxForm.tsx`：用 `SchemaForm` 与契约 schema。
5. 在 `pages/registry` 注册页面，对应 contracts 中声明的菜单。

## 5. 自动检查

规范靠工具保证，不只靠自觉：

| 检查                                                                                              | 工具               | 时机           |
| ------------------------------------------------------------------------------------------------- | ------------------ | -------------- |
| 格式与基础规则                                                                                    | Biome              | pre-commit、CI |
| 类型（禁止 `any`、strict）                                                                        | tsc                | pre-push、CI   |
| 依赖方向：包之间、后端 `modules → infra → core`、模块不互引内部文件、前端四层方向、功能模块不互引 | dependency-cruiser | CI             |
| 循环依赖                                                                                          | dependency-cruiser | CI             |

违反依赖方向的代码不能合并。

## 6. 验收标准

- 任意一个 Controller 文件里没有数据库查询；任意一个 Repository 文件里没有调用其他模块。
- 前端任意一个页面文件里没有直接调用 API 客户端，没有手写的表格分页逻辑。
- 新增“系统参数”这样的简单增删改查页面，前端只需写列定义、表单 schema 引用和页面组合，不超过约 150 行。
- 依赖方向检查在 CI 中运行并通过；故意加一条反向引用会导致 CI 失败。

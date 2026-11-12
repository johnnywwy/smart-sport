# 前端组件拆解

分析依据为 `智慧体育云后台设计稿.html` 的 13 张画板，以及 `architecture-diagram.html` 中的角色配置、组织架构、范围选择器和人员抽屉。实现边界以 spec 13、spec 16 及各业务规格为准。

## 2026-11-12 第二次设计稿更新（sports-cloud(2)）

新版共 13 张画板，实质调整集中于基础信息模块、平台管理模块、超管角色权限。已同步 HTML（仅清理行尾空白），SHA-256：`042d77d65f8901723f8334dab71fb3683298e2caf3f12bd5f89c1153e4b34918`。

- WorkspaceTabs：独立白色圆角条、32px 页签、各自关闭；关闭当前后进入剩余最后一个。保留用户确认的浅蓝选中、滚轮横移、隐藏滚动条和内容独立滚动。
- TablePagination：总数在左，条数选择与页码在右；TableConfirmAction：红色后果说明和确认按钮。
- 后续学校上下文拆为 SchoolContextPicker、SchoolSelectionPrompt、ActingOnSchoolNotice，归 T-166/T-167，依赖真实学校范围接口。
- 后续部门交互拆为 DepartmentForm、ParentTreePicker、DepartmentLocationPreview，归 T-162；树底与行内新增复用表单。
- 各业务页面补齐查看、编辑、危险操作、必填原因、导出确认与保存反馈，按 spec 13 验收；不生成无行为按钮。

## 2026-11-12 设计稿更新

本次采用用户覆盖后的 HTML（仅清理行尾空白；源文件6,887,494 字节，SHA-256：`5cbd0c12b1754947b5b9a8cbab5f0958a7220b1aa16f9d0cd1e359b0d1af64f4`）。画板由 8 张增加到 13 张；工作台改为模块内侧栏布局，基础信息补充成员账号及角色分配，平台端统一称为角色模板。

新增画板与组件规划：

| 画板              | 组件拆分                                                                                                                                                                                | 任务         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 09 平台管理模块   | PlatformManagementPage、PlatformFilters、OnboardingStepFlow、SchoolInfoStep、SchoolGradesStep、SchoolAdminStep、SchoolServiceStep、OnboardingResult；角色模板与菜单设置复用对应功能组件 | T-164、T-165 |
| 10 批量导入学生   | ImportWizard、ImportUploadStep、ImportPreviewStep、ImportResultStep、ImportUndoDialog；学生、班级、教师复用流程外框                                                                     | T-113、T-159 |
| 11 学年升级流程   | RolloverOverview、RolloverPrecheck、RolloverPreview、RolloverExceptions、GraduationDestination、TeachingCopyOptions、RolloverResult、RolloverUndoDialog                                 | T-081、T-199 |
| 12 转学办理流程   | TransferSearch、TransferEnrollmentForm、TransferTimeline、TransferReviewDialog、TransferResult；覆盖撤回、拒绝和提醒分支                                                                | T-101、T-168 |
| 13 代理商授权流程 | AgentGrantForm、GrantPermissionSelector、GrantEffectPreview、GrantResult、GrantRevokeDialog                                                                                             | T-052、T-168 |

以上每个组件仍遵守“组件文件夹 → TSX / 专属 CSS”的目录规则，按实际页面职责拆分，不把整个流程放进一个文件。

设计稿中的冲突按已确认规则处理：通知遵循用户要求的右上角 2 秒自动消失；角色模板不能在界面新增、删除内置角色；外校学生查找不暴露姓名、班级等安全规格禁止返回的信息。学年升级示例里的留级、休学人数存在文案混用，计算以真实数据及 spec 08 为准，不照抄示例数字。学校开通的业务校验与初始化步骤继续按 spec 14 执行，设计稿四个录入步骤与结果页不代表减少后台校验步骤。

## 目录约定

所有 `components` 目录内先建组件文件夹，再放组件文件。文件夹使用 kebab-case，组件文件使用 PascalCase，一个文件一个组件。例如：

```text
components/
  student-form-dialog/
    StudentFormDialog.tsx
    StudentFormDialog.test.tsx
```

测试文件在需要验证交互时加入。组件专属样式放在组件文件夹，由组件导入；页面和布局样式分别由页面、布局目录管理。`src/styles.css` 仅保留框架入口、全局主题和基础重置。类型文件仅在内容确实较多时拆出。类型优先从 contracts 引用，简单 props 与组件放在同一个文件。以下目录是实现规划，按任务逐个落地。

```text
apps/web/src/
  app/
    providers/                  Query、主题与通知装配
    router/                     路由与身份阶段入口
  layouts/
    admin-layout/
      AdminLayout.tsx           HeroUI Pro AppLayout 装配
      components/
        app-sidebar/AppSidebar.tsx
        sidebar-brand/SidebarBrand.tsx
        sidebar-menu-group/SidebarMenuGroup.tsx
        module-switcher/ModuleSwitcher.tsx
        app-header/AppHeader.tsx
        academic-selector/AcademicSelector.tsx
        current-school-selector/CurrentSchoolSelector.tsx
        identity-switcher/IdentitySwitcher.tsx
        identity-menu-item/IdentityMenuItem.tsx
        user-menu/UserMenu.tsx
        header-actions/HeaderActions.tsx
        workspace-tabs/WorkspaceTabs.tsx
        workspace-tab/WorkspaceTab.tsx
        workspace-breadcrumbs/WorkspaceBreadcrumbs.tsx
    auth-layout/
      AuthLayout.tsx
      components/
        auth-brand-panel/AuthBrandPanel.tsx
        auth-header/AuthHeader.tsx
  shared/
    ui/                         仅在需要统一外观时薄封装 HeroUI
    components/
      page-header/PageHeader.tsx
      data-table/DataTable.tsx
      table-toolbar/TableToolbar.tsx
      table-pagination/TablePagination.tsx
      table-column-settings/TableColumnSettings.tsx
      table-row-actions/TableRowActions.tsx
      table-bulk-actions/TableBulkActions.tsx
      filter-bar/FilterBar.tsx
      recycle-bin-tabs/RecycleBinTabs.tsx
      schema-form/SchemaForm.tsx
      schema-form-field/SchemaFormField.tsx
      form-dialog/FormDialog.tsx
      confirm-dialog/ConfirmDialog.tsx
      step-flow/StepFlow.tsx
      import-wizard/ImportWizard.tsx
      import-template-step/ImportTemplateStep.tsx
      import-upload-step/ImportUploadStep.tsx
      import-preview-step/ImportPreviewStep.tsx
      import-result-step/ImportResultStep.tsx
      scope-picker/ScopePicker.tsx
      region-scope-tree/RegionScopeTree.tsx
      school-scope-search/SchoolScopeSearch.tsx
      grade-scope-grid/GradeScopeGrid.tsx
      college-scope-list/CollegeScopeList.tsx
      scope-summary/ScopeSummary.tsx
      scope-explanation/ScopeExplanation.tsx
      masked-field/MaskedField.tsx
      can/Can.tsx
      status-badge/StatusBadge.tsx
      loading-state/LoadingState.tsx
      empty-state/EmptyState.tsx
      error-state/ErrorState.tsx
      operation-notice/OperationNotice.tsx
      version-watcher/VersionWatcher.tsx
    hooks/                      通用交互与权限 hooks
    api/                        API 客户端、错误转换
    stores/                     内存会话、当前学校和学年
  pages/
    login/
      LoginPage.tsx
      components/
        login-form/LoginForm.tsx
        captcha-field/CaptchaField.tsx
    select-org/
      SelectOrgPage.tsx
      components/
        organization-search/OrganizationSearch.tsx
        identity-group/IdentityGroup.tsx
        identity-card/IdentityCard.tsx
        organization-help/OrganizationHelp.tsx
    modules/
      ModulesPage.tsx
      components/
        module-grid/ModuleGrid.tsx
        module-card/ModuleCard.tsx
        module-menu-preview/ModuleMenuPreview.tsx
    workbench/
      WorkbenchPage.tsx
      components/
        welcome-panel/WelcomePanel.tsx
        portal-kpi-group/PortalKpiGroup.tsx
        portal-kpi-card/PortalKpiCard.tsx
        recent-todos/RecentTodos.tsx
        todo-preview-item/TodoPreviewItem.tsx
        recent-visits/RecentVisits.tsx
        semester-summary/SemesterSummary.tsx
        active-tasks/ActiveTasks.tsx
        task-progress-card/TaskProgressCard.tsx
  apps/
    org-permission/
      departments/
        pages/OrganizationStructurePage.tsx
        components/
          department-tree/DepartmentTree.tsx
          department-tree-node/DepartmentTreeNode.tsx
          department-details/DepartmentDetails.tsx
          department-scope-panel/DepartmentScopePanel.tsx
          department-form-dialog/DepartmentFormDialog.tsx
          member-table/MemberTable.tsx
          member-drawer/MemberDrawer.tsx
          member-role-selector/MemberRoleSelector.tsx
          member-department-selector/MemberDepartmentSelector.tsx
          member-extra-scope/MemberExtraScope.tsx
      roles/
        pages/RoleManagementPage.tsx
        components/
          role-list/RoleList.tsx
          role-list-item/RoleListItem.tsx
          role-editor/RoleEditor.tsx
          role-editor-header/RoleEditorHeader.tsx
          data-scope-options/DataScopeOptions.tsx
          permission-matrix/PermissionMatrix.tsx
          permission-group/PermissionGroup.tsx
          permission-feature-row/PermissionFeatureRow.tsx
          permission-level-selector/PermissionLevelSelector.tsx
          permission-action-selector/PermissionActionSelector.tsx
          permission-bulk-presets/PermissionBulkPresets.tsx
          role-change-summary/RoleChangeSummary.tsx
          role-preview/RolePreview.tsx
          role-menu-preview/RoleMenuPreview.tsx
          role-action-preview/RoleActionPreview.tsx
          role-form-dialog/RoleFormDialog.tsx
    school/
      students/
        pages/StudentListPage.tsx
        components/
          student-filters/StudentFilters.tsx
          student-table/StudentTable.tsx
          student-form-dialog/StudentFormDialog.tsx
          student-form/StudentForm.tsx
          student-identity-fields/StudentIdentityFields.tsx
          student-enrollment-fields/StudentEnrollmentFields.tsx
          student-detail-drawer/StudentDetailDrawer.tsx
      classes/
        components/
          class-type-tabs/ClassTypeTabs.tsx
          class-filters/ClassFilters.tsx
          class-table/ClassTable.tsx
          class-form-dialog/ClassFormDialog.tsx
          class-student-drawer/ClassStudentDrawer.tsx
      teachers/
        components/
          teacher-filters/TeacherFilters.tsx
          teacher-table/TeacherTable.tsx
          teacher-form-dialog/TeacherFormDialog.tsx
          teaching-assignment-dialog/TeachingAssignmentDialog.tsx
          teaching-class-selector/TeachingClassSelector.tsx
      profile/
        components/
          school-profile-card/SchoolProfileCard.tsx
          school-service-card/SchoolServiceCard.tsx
          school-applications/SchoolApplications.tsx
      rollover/
        components/
          rollover-steps/RolloverSteps.tsx
          rollover-precheck/RolloverPrecheck.tsx
          rollover-progress/RolloverProgress.tsx
          rollover-summary/RolloverSummary.tsx
      transfers/
        components/
          transfer-filters/TransferFilters.tsx
          transfer-table/TransferTable.tsx
          transfer-request-dialog/TransferRequestDialog.tsx
          transfer-review-dialog/TransferReviewDialog.tsx
      agent-grants/
        components/
          agent-grant-table/AgentGrantTable.tsx
          agent-grant-dialog/AgentGrantDialog.tsx
          grant-permission-selector/GrantPermissionSelector.tsx
    system/
      audit/
        components/
          audit-filters/AuditFilters.tsx
          audit-table/AuditTable.tsx
          audit-detail-drawer/AuditDetailDrawer.tsx
```

功能目录中同时保留 `hooks/`、`pages/`、`columns.tsx` 和公开 `index.ts`，树中仅详细展开组件位置。学校列表、机构管理、系统设置等设计稿没有完整展开的页面，后续按对应任务采用同一结构。

## 画板与组件对应

| 画板              | 拆解重点                                                                                                  | 任务                     |
| ----------------- | --------------------------------------------------------------------------------------------------------- | ------------------------ |
| 01 登录           | AuthLayout、品牌区、LoginForm、验证码字段；账号和密码输入采用 HeroUI                                      | T-153                    |
| 02 选择组织       | 搜索、按身份类型分组、身份卡片、上次使用标记、不可用原因                                                  | T-154                    |
| 03 选择模块       | ModuleGrid / ModuleCard，仅展示可用模块；单模块自动跳过                                                   | T-155                    |
| 04 我的工作台     | 模块侧栏第一项，默认打开且页签不可关闭；欢迎区、Pro KPIGroup/KPI、待办、最近访问                          | T-155、T-156、T-169      |
| 05 基础信息模块   | 同一个 AdminLayout 配合路由切换页面，菜单按 spec 04 的分组映射到功能模块，公共列表和分页由 DataTable 负责 | T-156、T-162 至 T-172 等 |
| 06 身份菜单对照   | 作为权限与菜单验收矩阵，覆盖五类后台身份                                                                  | T-046、T-156             |
| 07 新增弹窗与提示 | FormDialog + SchemaForm + StudentForm；字段错误、操作通知和删除确认分开处理                               | T-158、T-167             |
| 08 角色与权限配置 | 角色列表、范围卡片、权限矩阵、逐行动作细调、改动摘要、预览面板                                            | T-163；完整预览属于 P1   |

## 组件职责与组合

- `AdminLayout` 只组合外壳，侧栏底部放模块切换器，第一项固定为工作台。`AppHeader` 组合学年、学校、身份和用户控件。每个菜单自行管理开关状态，选项与选择回调通过 props 传入。
- `WorkspaceTabs` 负责页签行为，路由管理当前页面。切换身份时由应用层清空服务端缓存和身份相关页签。
- `DataTable` 组合工具栏、行操作、批量操作、列设置和分页。StudentTable / TeacherTable 只提供契约数据与列配置。
- `SchemaForm` 负责契约校验和提交状态。StudentForm 组合身份字段组与学籍字段组，StudentFormDialog 负责弹窗开关与标题。
- `MemberDrawer` 组合部门、角色、额外负责范围及 ScopeExplanation。ScopePicker 共用于部门与个人负责范围编辑。
- `PermissionFeatureRow` 组合档位选择和动作细调。PermissionMatrix 负责分组，RoleEditor 组合范围、矩阵和保存控制，RolePreview 接收计算结果。
- `OperationNotice` 统一使用 HeroUI Toast。成功与失败提示均在右上角，默认 2 秒后消失；关闭按钮使用圆形外框。字段校验错误交给表单字段展示。
- 页面负责组合，查询与提交写入对应 hooks。展示组件通过 props 接收数据和事件，服务端状态由 TanStack Query 管理。
- HeroUI 的 Button、Input、Select、Modal、Sheet、Table 等直接复用。Pro 外壳、Sidebar、KPI 按子路径导入。具有重复业务职责的区域才抽成新组件。

## 设计稿与规格的差异

| HTML 内容                      | 实施处理                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------- |
| 基础信息、平台管理两个模块     | 按新版 spec 04 第 3.1 节实现两个模块；五个应用保留为权限码命名空间                |
| 跳绳、跑步及更多模块卡片       | 属于后续业务，M1 模块入口按 `/modules/available` 显示                             |
| 只有一个模块时跳过选择         | 按新版 spec 13 跳过选择，直接进入唯一模块的工作台                                 |
| 超管页面直接修改全平台内置角色 | 按新版 spec 04 第 6.1 节实现平台角色模板覆盖；超级管理员角色本身只读              |
| 图中代理商可操作学年升级       | 按新版 spec 05 将学年升级纳入可授权清单；导出和敏感信息默认不给，实际动作仍取交集 |
| 图中角色实时预览、个人权限追踪 | 按任务划分推进，避免把 P1 预览提前作为基础角色页的依赖                            |

## 实施顺序

按任务逐步落地以下独立单元；目录树表示目标结构，不代表所有页面已经实现：

1. 提取应用 providers、路由和 UI 偏好 store。
2. 提取 AdminLayout、AppHeader、AppSidebar、身份及用户菜单容器。
3. 拆分 ModulesPage 的模块卡片，以及 WorkbenchPage 的欢迎区、KPIGroup、待办和最近访问。
4. 把 BackendHealth 的请求放到 hook，展示组件移动到 `components/backend-health/BackendHealth.tsx`。
5. 再接 T-151 API 客户端与通知、版本提示组件，随后按功能切片接入具体页面。

先实现当前页面需要的组件，每个组件拥有上述独立目录；后续任务逐步补齐对应组件。

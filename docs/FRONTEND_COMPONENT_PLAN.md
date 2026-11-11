# 前端组件拆解

分析依据为 `智慧体育云后台设计稿.html` 的 8 张画板，以及 `architecture-diagram.html` 中的角色配置、组织架构、范围选择器和人员抽屉。实现边界以 spec 13、spec 16 及各业务规格为准。

## 目录约定

所有 `components` 目录内先建组件文件夹，再放组件文件。文件夹使用 kebab-case，组件文件使用 PascalCase，一个文件一个组件。例如：

```text
components/
  student-form-dialog/
    StudentFormDialog.tsx
    StudentFormDialog.test.tsx
```

测试文件在需要验证交互时加入。组件独立样式、类型文件仅在内容确实较多时拆出。类型优先从 contracts 引用，简单 props 与组件放在同一个文件。以下目录是实现规划，按任务逐个落地。

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
    portal/
      PortalPage.tsx
      components/
        welcome-panel/WelcomePanel.tsx
        portal-kpi-group/PortalKpiGroup.tsx
        portal-kpi-card/PortalKpiCard.tsx
        application-grid/ApplicationGrid.tsx
        application-card/ApplicationCard.tsx
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

| 画板              | 拆解重点                                                                                   | 任务                     |
| ----------------- | ------------------------------------------------------------------------------------------ | ------------------------ |
| 01 登录           | AuthLayout、品牌区、LoginForm、验证码字段；账号和密码输入采用 HeroUI                       | T-153                    |
| 02 选择组织       | 搜索、按身份类型分组、身份卡片、上次使用标记、不可用原因                                   | T-154                    |
| 03 选择模块       | ApplicationGrid / ApplicationCard 与门户共用，应用数据由可用应用契约提供                   | T-155                    |
| 04 我的工作台     | 公共外壳、欢迎区、Pro KPIGroup/KPI、模块网格、学期摘要、待办和任务进度                     | T-155、T-156、T-169      |
| 05 基础信息模块   | 同一个 AdminLayout 配合路由切换页面，十个菜单独立功能模块，公共列表和分页由 DataTable 负责 | T-156、T-162 至 T-172 等 |
| 06 身份菜单对照   | 作为权限与菜单验收矩阵，覆盖五类后台身份                                                   | T-046、T-156             |
| 07 新增弹窗与提示 | FormDialog + SchemaForm + StudentForm；字段错误、操作通知和删除确认分开处理                | T-158、T-167             |
| 08 角色与权限配置 | 角色列表、范围卡片、权限矩阵、逐行动作细调、改动摘要、预览面板                             | T-163；完整预览属于 P1   |

## 组件职责与组合

- `AdminLayout` 只组合外壳。`AppHeader` 组合学年、学校、身份和用户控件。每个菜单自行管理开关状态，选项与选择回调通过 props 传入。
- `WorkspaceTabs` 负责页签行为，路由管理当前页面。切换身份时由应用层清空服务端缓存和身份相关页签。
- `DataTable` 组合工具栏、行操作、批量操作、列设置和分页。StudentTable / TeacherTable 只提供契约数据与列配置。
- `SchemaForm` 负责契约校验和提交状态。StudentForm 组合身份字段组与学籍字段组，StudentFormDialog 负责弹窗开关与标题。
- `MemberDrawer` 组合部门、角色、额外负责范围及 ScopeExplanation。ScopePicker 共用于部门与个人负责范围编辑。
- `PermissionFeatureRow` 组合档位选择和动作细调。PermissionMatrix 负责分组，RoleEditor 组合范围、矩阵和保存控制，RolePreview 接收计算结果。
- `OperationNotice` 统一使用 HeroUI Toast。成功提示按稿件 3 秒消失，失败和需要处理的提示提供关闭及操作入口。字段校验错误交给表单字段展示。
- 页面负责组合，查询与提交写入对应 hooks。展示组件通过 props 接收数据和事件，服务端状态由 TanStack Query 管理。
- HeroUI 的 Button、Input、Select、Modal、Sheet、Table 等直接复用。Pro 外壳、Sidebar、KPI 按子路径导入。具有重复业务职责的区域才抽成新组件。

## 设计稿与规格的差异

| HTML 内容                      | 实施处理                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| 基础信息、平台管理两个模块     | 规格定义五个应用，先复用画板的布局结构，菜单与应用归属按 contracts 和 spec 04 实现     |
| 跳绳、跑步及更多模块卡片       | 属于后续业务，M1 应用入口按可用应用接口显示                                            |
| 只有一个模块时跳过选择         | spec 13 定义进入门户，再进入应用，路由按规格执行                                       |
| 超管页面直接修改全平台内置角色 | spec 04 规定内置角色不可编辑，先实现自定义角色编辑与内置角色只读展示                   |
| 图中代理商可操作学年升级       | spec 05 的默认代理商授权清单仅含班级、教学班、学生和教师，实际动作按声明与授权交集显示 |
| 图中角色实时预览、个人权限追踪 | 按任务划分推进，避免把 P1 预览提前作为基础角色页的依赖                                 |

## 先落地的拆分

现有 `app.tsx` 集中了门户、工作区、路由、偏好状态与布局。第一次重构按以下独立单元推进：

1. 提取应用 providers、路由和 UI 偏好 store。
2. 提取 AdminLayout、AppHeader、AppSidebar、身份及用户菜单容器。
3. 提取 PortalPage 的欢迎区、KPIGroup、应用网格与卡片。
4. 把 BackendHealth 的请求放到 hook，展示组件移动到 `components/backend-health/BackendHealth.tsx`。
5. 再接 T-151 API 客户端与通知、版本提示组件，随后按功能切片接入具体页面。

先实现当前页面需要的组件，每个组件拥有上述独立目录；后续任务逐步补齐对应组件。

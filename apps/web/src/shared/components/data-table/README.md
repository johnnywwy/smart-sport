# DataTable

T-157 通用列表。控件全部使用 HeroUI 3，样式由组件目录管理。参考离线设计稿的“基础信息模块”“平台管理模块”：36px 按钮、20px 标题、灰色查询框与表头、白色数据行、右下角分页。

## 接入

页面的 hook 负责请求和契约校验，`DataTable` 只接收已解析的数据、受控查询和回调，不自行请求或读取会话。

```tsx
<DataTable
  scopeKey={`${identity.id}:${schoolId ?? ""}`}
  config={config}
  data={queryResult.data}
  query={tableQuery}
  onQueryChange={setTableQuery}
  status={{
    loading: queryResult.isFetching,
    error: queryResult.isError,
    onRetry: () => void queryResult.refetch(),
  }}
/>;
```

- `config.columns`：列标识、中文标题、渲染函数和 `sortable`；首列作为行标题始终保留，`required` 列不可隐藏。列标识不能使用内部保留值 `$selection`、`$actions`。
- `config.filters`：筛选标识、中文名称及选项。`__all` 为内部保留选项，提交“全部”时输出空字符串；hook 根据业务契约省略空值。
- `config.actions`：配置新增、导入、导出回调及已有权限码，通过 `Can` 显示。权限集合由调用方提供，不能根据角色名称推断权限。
- `config.rowActions`：按当前行的 `allowedActions` 显示，支持查看、编辑、删除、恢复等动作。删除和标为 `danger` 的操作自动弹出确认框，可通过 `confirmation` 说明具体后果。
- `config.batchActions`：配置动作名称、已有权限码与行能力 `requiredAction`；只有有权执行的操作才显示。选中范围限本页可操作记录，若混选了不满足某动作能力的记录，该批量按钮禁用。业务 hook 逐条提交版本并处理部分失败。`selectionRevision` 在写入后递增，清除旧选择；`activeRowId` 仅标出正在查看的记录，不等同于勾选。
- `config.batchDelete`：需要全局删除权限，只勾选本页拥有 `delete` 的记录，确认后回调接收仍有权限的当前记录。真正的删除请求、成功通知及列表刷新由业务 hook 负责。
- `config.recycleBin`：启用“全部 / 回收站”，`query.deleted` 控制查询。回收站隐藏新增、导入、导出与批量删除；恢复通过行操作配置。
- `scopeKey`：必须含当前身份 id，学校数据再含学校 id。切换后重置勾选和列设置；TanStack Query 的 key 仍需由业务 hook 单独包含这些值。

`TableQuery` 是组件视图状态；分页字段由公共契约类型派生。请求前由 hook 转为对应接口的契约，不能把整个视图状态直接传给后端。`tableSortParameter(query.sort)` 输出公共约定的 `字段:asc` / `字段:desc`，只对接口支持的字段配置排序。

查询、筛选、排序、每页条数及回收站改变时回到第一页；翻页保留查询条件。勾选随查询或权限变化清空，列设置在同一身份与学校内保留。组件不实现页面 KeepAlive 或刷新恢复。

## 验证

- `table-state.test.ts`：查询状态、排序参数、分页窗口、列设置和批量删除的权限边界。
- `DataTable.test.tsx`：顶部和行权限、回收站、恢复、加载、空、错误及旧数据隐藏。
- 浏览器使用临时设计稿示例验证搜索、筛选、排序、隐藏列、分页、只读、回收站、删除确认和身份切换；临时页面不进入正式路由。

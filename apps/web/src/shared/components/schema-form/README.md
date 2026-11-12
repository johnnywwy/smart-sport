# SchemaForm 与 FormDialog

T-158 的通用表单。复用 contracts 的请求 schema，不在组件里定义业务校验、发请求或保存全局业务状态。交互控件全部来自 HeroUI 3。

## 组件职责

- `SchemaForm`：契约校验、初值、字段错误、提交状态、版本冲突和幂等周期；通过 props 组合字段。
- `FormDialog`：设计稿中的 560px 弹窗、24px 圆角与内边距、右上角 36px 关闭按钮。保存成功后关闭；保存期间禁止关闭、取消和遮罩退出。
- 子组件分别负责字段、操作区和反馈；CSS 放在所属目录。

## 配置

`schema` 直接传已有契约，例如 `updateOrganizationRequestSchema`。`fields` 仅声明显示元数据，不重复定义长度、格式等业务校验：

```tsx
<FormDialog
  isOpen={open}
  onOpenChange={setOpen}
  title="编辑机构"
  scopeKey={`${identity.id}:${record.id}`}
  schema={updateOrganizationRequestSchema}
  initialValues={record}
  version={record.version}
  fields={[
    { name: "name", label: "机构名称", placeholder: "请输入机构名称" },
    {
      name: "regionCode",
      label: "所属地区",
      type: "custom",
      render: ({ value, disabled, invalid, errorId, onChange }) => (
        <RegionPicker
          {...regionTree}
          onRetry={regionTree.retry}
          value={typeof value === "string" ? value : null}
          selectedLabel={record.regionName ?? ""}
          expandedCodes={expanded}
          onExpandedChange={setExpanded}
          onChange={onChange}
          disabled={disabled}
          invalid={invalid}
          errorId={errorId}
        />
      ),
      required: false,
    },
  ]}
  submitLabel="保存"
  rule="保存后立即生效，修改会记入操作记录。"
  onSubmit={save}
  onReload={reload}
/>;
```

字段支持 text、password、email、tel、date、number、textarea、select、checkbox。Select 的 option value 支持字符串和数字，保持原始类型；number 转为数值，checkbox 提交布尔值。日期提交 ISO 日期文本。不要把 UUID 或系统编码作为可见字段。空值最终是否合法由请求契约决定；可空字段通过初值传 null。

`required` 仅控制必填标记及无障碍语义，默认 true；切换开关通常设为 false，避免把“未勾选”误作不合法。`readOnly` 配合 `readOnlyReason` 展示不可修改原因；只读下拉展示名称，保留提交原值。`description` 为字段说明，`fullWidth` 为两列布局中的跨列字段，`columns={2}` 可启用两列，窄屏自动单列。

原登录和改密表单显式使用 `appearance="auth"`，保留原样式、定制校验文案、预留错误区域和提交后清空密码。业务表单默认使用 default 外观。错误提示出现不会挤动相邻字段，输入或选择后清除对应错误状态；服务端未知路径或表单级错误显示在反馈区。

复杂业务控件可用 children 函数接收 `{ values, errors, disabled, setValue }`，组合已有 HeroUI 或业务组件；通过 `setValue` 更新整个契约字段，例如角色档位数组。嵌套错误路径仍保留并显示。普通表单不需要此扩展。

## 省市区树选择

所属地区使用 `RegionPicker`，不能用省份平铺下拉代替。它组合 HeroUI Popover 与 Pro FileTree，按省 → 市 → 区县逐级展开，支持直接选择省或市。已选地区显示名称路径，长路径截断但可通过 title 查看完整内容；不把编码当名称显示。

页面数据 hook 使用 `useRegionTree(identity.id, expanded)` 调用现有 `/api/v1/regions?parent=`，按层加载，查询 key 包含身份。收起分支后保留已加载数据，避免选中名称丢失。组件只接收数据和回调，包含加载及失败重试状态。编辑记录尚未加载对应分支时传 `selectedLabel` 作为名称回显；没有取得真实路径时不根据编码猜测父级。

custom 字段的 render 接收 `{ value, disabled, invalid, errorId, onChange }`，用于组合此类复杂控件；控件应关联 errorId，让辅助技术能读到对应错误。

## 提交与请求

`onSubmit(values, context)` 中 values 已经经过契约解析，包含自动附加的 `version`。初始版本 0 有效；version 不作为可编辑字段。context 包含 `idempotencyKey` 和 `signal`。页面的数据 hook 必须将二者传给 API 客户端，例如：

```ts
await apiClient.request(path, responseSchema, {
  method: "PATCH",
  body: values,
  ...context,
});
```

请求仍由页面数据 hook 处理。hook 在保存成功后刷新对应 Query 缓存、发出已有的右上角 2 秒成功通知；失败时应继续抛出错误，由 API 客户端统一通知，并由表单显示字段或版本反馈。不要吞掉异常，否则弹窗会把返回视为成功。不要在请求失败时更换幂等键，或丢弃 context 让 API 客户端为每次重试生成新键。

- 打开表单生成键；同一份数据失败重试复用键；经过契约解析的数据改变时换键。仅保存数据摘要，不在提交控制器保存敏感明文。
- 同步锁阻止快速连点；提交期间禁用字段和操作。
- 90002 保留当前内容并禁止再次保存；`onReload` 从真实接口加载后返回 `{ values, version }`，更新表单与版本、清除冲突，用户检查后重新保存，不自动重试。没有 reload 回调时提示关闭重开。
- 90003 不能直接视为成功；提示确认处理结果，保留重试键。具体结果是否可用仍由业务响应契约判定。
- `scopeKey` 改变会重置整个表单，必须包含当前身份与记录；同一记录的初值只在挂载或显式重新加载时应用，避免后台查询更新覆盖用户输入。
- FormDialog 关闭后卸载表单，重开恢复初值并生成新键。卸载会中止信号，丢弃旧结果。自定义请求必须传递 signal。

本任务不提前开放机构或系统参数业务页面，不新增接口、迁移和依赖。S-05 完整切片仍需后续真实业务页面联调。

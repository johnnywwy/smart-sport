# ScopePicker

T-160 第一阶段支持公司、教育局的区域树和学校搜索。所有候选来自组织边界内的 `/scope-options` 或目标成员的 `/identities/:id/scope-options`，不使用全量 `/regions`。学校年级/学院和代理商候选待其后端数据依赖就绪后开放。

业务页面在 hook 层调用 `useScopeOptions({ identityId, orgId, targetIdentityId, allowedTypes, enabled })`，再把返回的 `candidates` 传给此组件；组件自身不调用 API、不读取会话。`allowedTypes` 必须来自目标详情契约，`enabled` 应结合服务端操作能力与权限。

```tsx
<ScopePicker
  key={candidates.scopeKey}
  candidates={candidates}
  value={draft}
  onChange={setDraft}
  disabled={saving || !canUpdate}
/>;
```

`value` 是受控的 `ScopeOption[]`，展示名称及失效状态来自部门负责范围详情。业务容器切换身份、组织或目标对象时必须重置草稿，推荐以身份、组织和对象 ID 组成 key 重挂载整个编辑器，不能把上一个目标的选择传给新目标。查询 key 已隔离身份和组织，搜索、分页与展开状态也在边界变化的当次渲染重置。

- 勾选区域即包含其下级，按服务端返回的父级关系显示“已包含”，不通过编码推测或生成候选。取消上级后，之前显式选择的子级仍保留。
- 展开按需请求，收起后保留已加载分支；分支超过一页时完整读取，错误允许重试。叶子首次展开确认没有下级后移除展开占位。
- 学校搜索和分页更换候选不会清除已选项；旧请求取消且不复用上一查询的结果。
- 只读仍可展开、搜索与翻页查看；不可勾选或移除。失效项使用通用名称，可从已选中移除，不能重新选择。
- 右侧显示真实选择项计数，**不是**展开后的学校去重数。部门保存数来自 GET/PUT 的 `schoolCount`，T-172 的草稿预览通过 `/scope/preview` 去重计算，成员实际可见通过 `/identities/:id/visible` 逐操作计算。此组件不展示旧数量或编造重叠数量。
- 保存时使用 `scopeValues(draft)` 提取 `{ type, value }` 并消费共享 schema。部门版本、提交幂等、保存冲突及保存后的 `schoolCount` 由 T-172 的业务表单管理；本任务不新增永久预览路由。

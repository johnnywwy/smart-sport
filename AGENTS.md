# 项目约束

- 开始任务先读 docs/TASKS.md、docs/ARCHITECTURE.md 和对应 spec，按功能切片推进。
- Web 使用 React 19、Vite 7、HeroUI 3 + HeroUI React Pro、Tailwind 4。
- 所有 UI 控件必须使用 HeroUI；布局、侧栏、KPI 优先使用 Pro。禁止引入 React Native、HeroUI Native、其他 UI 库或用原生 HTML 交互控件替代 HeroUI。语义化文本与非交互布局标签允许使用；HeroUI 内部输出 DOM 不受限制。
- Pro 按子路径导入，不从根入口导入全部组件。
- 所有依赖锁定精确版本。密钥只通过环境变量注入，禁止进入源码、文档、锁文件或前端 VITE_* 环境变量。
- 运行 pnpm lint、pnpm typecheck、pnpm build。未验收的任务不得标记完成。
- 不自行提交、发布或部署；本仓库按文档中的 Docker Compose 架构开发。

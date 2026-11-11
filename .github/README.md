# 持续集成

T-005 在推送任意分支和创建或更新 Pull Request 时执行：冻结锁文件安装 → HeroUI Pro 授权安装 → lint → 依赖方向与规则验收 → typecheck → unit → build。任一步失败，检查失败；同一分支的新运行会取消旧运行。

Node.js 使用 24 LTS，pnpm 版本来自根 `package.json` 的 `packageManager`。`pnpm test:unit` 通过 Turborepo 运行目前提供 `test` 脚本的 config、domain、web 包；后续集成测试使用独立脚本，不混入这一阶段。当前工作流不启动数据库、不运行 Testcontainers、不部署。

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加 `HEROUI_KEY`，值使用已有的 HeroUI Pro 授权密钥。工作流通过环境变量传给 `pnpm setup:hero`，不写入仓库、不上传安装目录或构建产物，也不缓存授权后的 Pro 文件。安装后检查所有工作区依赖声明和锁文件，禁止 CI 悄悄改变版本。

GitHub 不向外部 fork 的 Pull Request 提供仓库 Secret，因此该类运行会在授权安装步骤失败。维护者应先审查变更，再在可信分支验证；不要改用 `pull_request_target` 向未审查代码提供密钥。

首次推送后检查 Actions 的“工程检查”结果。要强制失败时禁止合并，需要管理员在仓库 ruleset 或分支保护中将“安装、静态检查、单测与构建”设置为必需检查；仅新增工作流不会自动启用分支保护。

本地按顺序运行 `pnpm lint`、`pnpm typecheck`、`pnpm test:unit`、`pnpm build`。依赖方向检查由 T-200 提供：`pnpm check:deps` 扫描代码，`pnpm test:deps` 验证合法依赖和违规案例。规则按目录约束包边界、后端层级与模块公开入口、前端四层及功能边界，并禁止循环依赖；不能替代对 Service 导出内容和业务职责的人工评审。集成测试、隔离测试和漏洞扫描属于后续任务。

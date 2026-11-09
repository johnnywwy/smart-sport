# 智慧体育云平台

按 `docs/` 的 M1 规格开发，目前从 S-01 工程骨架开始。

使用 Node.js 24+ 和 pnpm 10.34.9。先执行 `pnpm install --frozen-lockfile`，通过环境变量提供 `HEROUI_KEY` 后执行 `pnpm setup:hero`，再执行 `pnpm dev`。

前端仅使用 HeroUI Web / HeroUI React Pro，禁止 Native 与原生交互控件替代。详细安装、验证和当前限制见 [本地开发说明](docs/DEVELOPMENT.md)。

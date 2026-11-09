import { spawnSync } from "node:child_process";

if (!process.env.HEROUI_KEY) {
  console.error(
    "请通过环境变量提供 HEROUI_KEY，然后重新运行 pnpm setup:hero。",
  );
  process.exit(1);
}
const result = spawnSync("pnpm", ["dlx", "hpsetup@4.7.4", "react", "--auto"], {
  stdio: "inherit",
  env: process.env,
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);

import { spawnSync } from "node:child_process";
import husky from "husky";

const repo = spawnSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" });
if (repo.status === 0) {
  const message = husky();
  if (message) console.log(message);
  const existing = spawnSync("git", ["config", "--local", "--get", "alias.cz"]);
  if (existing.status !== 0) {
    const result = spawnSync(
      "git",
      ["config", "--local", "alias.cz", "!pnpm exec cz"],
      { stdio: "inherit" },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

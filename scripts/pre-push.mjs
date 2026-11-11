import { spawnSync } from "node:child_process";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const refs = input.trim()
  ? input
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/\s+/))
  : [];
const zero = /^0+$/;
const pushes = refs.filter(([, local]) => local && !zero.test(local));
if (refs.length && !pushes.length) process.exit(0);

// New remote branches need all workspace checks. Existing branches include dependents.
const filters =
  pushes.length &&
  pushes.every(([, , , remote]) => remote && !zero.test(remote))
    ? pushes.map(([, , , remote]) => `--filter=...[${remote}]`)
    : [];
const result = spawnSync(
  "pnpm",
  ["exec", "turbo", "run", "typecheck", "test", ...filters],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);

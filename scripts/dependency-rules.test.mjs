import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

const cli = resolve(
  "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs",
);
const modulePath = "apps/server/src/modules/platform";
const featurePath = "apps/web/src/apps/school";
const cases = [
  [
    "包不能引用应用",
    "packages/contracts/src/index.ts",
    "apps/web/src/main.ts",
    "packages-never-import-apps",
  ],
  [
    "前后端不能互引",
    "apps/web/src/main.ts",
    "apps/server/src/main.ts",
    "web-no-other-apps",
  ],
  [
    "core 不能引用 infra",
    "apps/server/src/core/context.ts",
    "apps/server/src/infra/db.ts",
    "core-no-upper-layers",
  ],
  [
    "infra 不能引用业务",
    "apps/server/src/infra/db.ts",
    `${modulePath}/auth/index.ts`,
    "infra-no-modules",
  ],
  [
    "模块不能访问其他模块内部",
    `${modulePath}/auth/auth.service.ts`,
    `${modulePath}/org/org.service.ts`,
    "module-public-entry:",
  ],
  [
    "仓储不能调用其他模块",
    `${modulePath}/auth/auth.repository.ts`,
    `${modulePath}/org/index.ts`,
    "repository-no-other-modules:",
  ],
  [
    "控制器不能访问仓储",
    `${modulePath}/auth/auth.controller.ts`,
    `${modulePath}/auth/auth.repository.ts`,
    "controller-no-repository",
  ],
  [
    "基础组件不能引用通用业务组件",
    "apps/web/src/shared/ui/button.ts",
    "apps/web/src/shared/components/table.ts",
    "ui-no-business",
  ],
  [
    "通用组件不能引用功能",
    "apps/web/src/shared/components/table.ts",
    `${featurePath}/students/components/form.ts`,
    "shared-no-feature-or-assembly",
  ],
  [
    "功能模块不能互引",
    `${featurePath}/students/hooks/list.ts`,
    `${featurePath}/teachers/hooks/list.ts`,
    "feature-no-siblings:",
  ],
  [
    "页面不能直接访问客户端",
    `${featurePath}/students/pages/list.ts`,
    "apps/web/src/shared/api/client.ts",
    "pages-no-api-client",
  ],
  [
    "功能组件不能引用页面",
    `${featurePath}/students/components/form.ts`,
    `${featurePath}/students/pages/list.ts`,
    "feature-components-no-pages",
  ],
  [
    "worker 不能引用 server 内部",
    "apps/worker/src/main.ts",
    `${modulePath}/auth/auth.service.ts`,
    "worker-server-public-entry-only",
  ],
];

function runGraph(files) {
  const root = mkdtempSync(join(tmpdir(), "smart-sport-deps-"));
  try {
    copyFileSync(
      ".dependency-cruiser.cjs",
      join(root, ".dependency-cruiser.cjs"),
    );
    copyFileSync(
      "tsconfig.dependencies.json",
      join(root, "tsconfig.dependencies.json"),
    );
    for (const [file, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), contents);
    }
    const result = spawnSync(
      process.execPath,
      [
        cli,
        "--config",
        ".dependency-cruiser.cjs",
        "--output-type",
        "json",
        ...Object.keys(files),
      ],
      { cwd: root, encoding: "utf8" },
    );
    const validation = spawnSync(
      process.execPath,
      [cli, "--config", ".dependency-cruiser.cjs", ...Object.keys(files)],
      { cwd: root, encoding: "utf8" },
    );
    assert.ifError(validation.error);
    assert.ifError(result.error);
    assert.ok(result.stdout, result.stderr);
    return {
      status: validation.status,
      violations: JSON.parse(result.stdout).summary.violations,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function relativeImport(from, to) {
  // 使用跨平台相对路径，生成的 TypeScript import 统一为正斜杠。
  const fromParts = from.split("/").slice(0, -1);
  const toParts = to.split("/");
  while (fromParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return `${fromParts.length ? "../".repeat(fromParts.length) : "./"}${toParts.join("/")}`;
}
for (const [name, from, to, rule] of cases) {
  test(name, () => {
    const result = runGraph({
      [from]: `import '${relativeImport(from, to)}';`,
      [to]: "export const value = 1;",
    });
    assert.equal(result.status, 1);
    assert.ok(
      result.violations.some((v) => v.rule.name.startsWith(rule)),
      JSON.stringify(result.violations),
    );
  });
}
test("合法分层和模块公开入口可通过", () => {
  const service = `${modulePath}/auth/auth.service.ts`;
  const entry = `${modulePath}/org/index.ts`;
  const result = runGraph({
    [service]: `import '${relativeImport(service, entry)}';`,
    [entry]: "export const service = 1;",
  });
  assert.equal(result.status, 0);
  assert.deepEqual(result.violations, []);
});
test("循环引用会失败", () => {
  const result = runGraph({
    "packages/domain/src/a.ts": "import './b';",
    "packages/domain/src/b.ts": "import './a';",
  });
  assert.equal(result.status, 1);
  assert.ok(result.violations.some((v) => v.rule.name === "no-circular"));
});

test("通过包名导入也必须遵守包边界", () => {
  const result = runGraph({
    "packages/contracts/src/index.ts": "import '@smart-sport/domain';",
    "packages/domain/src/index.ts": "export const value = 1;",
  });
  assert.equal(result.status, 1);
  assert.ok(
    result.violations.some((v) => v.rule.name === "contracts-are-independent"),
  );
});

test("类型引用也不能反向依赖", () => {
  const result = runGraph({
    "apps/web/src/shared/ui/button.ts":
      "import type { Value } from '../components/table'; export type ButtonValue = Value;",
    "apps/web/src/shared/components/table.ts": "export type Value = string;",
  });
  assert.equal(result.status, 1);
  assert.ok(result.violations.some((v) => v.rule.name === "ui-no-business"));
});

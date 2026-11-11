const fs = require("node:fs");

const directories = (root) =>
  fs.existsSync(root)
    ? fs
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${root}/${entry.name}`)
    : [];
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const boundary = (name, from, to) => ({
  name,
  severity: "error",
  from: { path: from },
  to: { path: to },
});
const serverModules = directories("apps/server/src/modules").flatMap(
  directories,
);
const webModules = directories("apps/web/src/apps").flatMap(directories);

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-unresolved",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    boundary("packages-never-import-apps", "^packages/", "^apps/"),
    boundary(
      "contracts-are-independent",
      "^packages/contracts/",
      "^packages/(domain|config)/",
    ),
    boundary(
      "config-is-independent",
      "^packages/config/",
      "^packages/(domain|contracts)/",
    ),
    boundary(
      "domain-does-not-import-config",
      "^packages/domain/",
      "^packages/config/",
    ),
    boundary(
      "pure-packages-no-frameworks",
      "^packages/(contracts|domain)/",
      "(^|node_modules/)(@nestjs/|react(?:-dom)?(?:/|$)|drizzle-orm(?:/|$))",
    ),
    boundary("web-no-other-apps", "^apps/web/", "^apps/(server|worker)/"),
    boundary("server-no-other-apps", "^apps/server/", "^apps/(web|worker)/"),
    boundary("worker-no-web", "^apps/worker/", "^apps/web/"),
    {
      name: "worker-server-public-entry-only",
      severity: "error",
      from: { path: "^apps/worker/" },
      to: { path: "^apps/server/", pathNot: "^apps/server/src/index\\.ts$" },
    },
    boundary(
      "core-no-upper-layers",
      "^apps/server/src/core/",
      "^apps/server/src/(infra|modules)/",
    ),
    boundary(
      "infra-no-modules",
      "^apps/server/src/infra/",
      "^apps/server/src/modules/",
    ),
    boundary(
      "controller-no-repository",
      "^apps/server/src/.*\\.controller\\.ts$",
      "\\.repository\\.ts$",
    ),
    ...serverModules.flatMap((module) => [
      {
        name: `module-public-entry:${module}`,
        severity: "error",
        from: {
          path: "^apps/server/src/modules/",
          pathNot: `^${escapePattern(module)}/`,
        },
        to: {
          path: `^${escapePattern(module)}/`,
          pathNot: `^${escapePattern(module)}/index\\.ts$`,
        },
      },
      {
        name: `repository-no-other-modules:${module}`,
        severity: "error",
        from: { path: `^${escapePattern(module)}/.*\\.repository\\.ts$` },
        to: {
          path: "^apps/server/src/modules/",
          pathNot: `^${escapePattern(module)}/`,
        },
      },
    ]),
    boundary(
      "shared-no-feature-or-assembly",
      "^apps/web/src/shared/",
      "^apps/web/src/(apps|pages|layouts|app)/",
    ),
    boundary(
      "ui-no-business",
      "^apps/web/src/shared/ui/",
      "^apps/web/src/shared/(components|hooks|api|stores)/",
    ),
    boundary(
      "business-components-no-data-or-state",
      "^apps/web/src/shared/components/",
      "^apps/web/src/shared/(hooks|api|stores)/",
    ),
    boundary(
      "features-no-assembly",
      "^apps/web/src/apps/",
      "^apps/web/src/(app|layouts|pages)/",
    ),
    boundary(
      "feature-components-no-pages",
      "^apps/web/src/apps/[^/]+/[^/]+/components/",
      "^apps/web/src/apps/[^/]+/[^/]+/pages/",
    ),
    boundary(
      "pages-no-api-client",
      "^apps/web/src/(pages/|apps/[^/]+/[^/]+/pages/)",
      "^apps/web/src/shared/api/",
    ),
    boundary(
      "components-no-api-client",
      "^apps/web/src/.*components/",
      "^apps/web/src/shared/api/",
    ),
    ...webModules.map((module) => ({
      name: `feature-no-siblings:${module}`,
      severity: "error",
      from: { path: `^${escapePattern(module)}/` },
      to: {
        path: "^apps/web/src/apps/",
        pathNot: `^${escapePattern(module)}/`,
      },
    })),
    boundary(
      "production-no-mocks",
      "^apps/web/src/(app|apps|layouts|pages|shared)/",
      "^apps/web/src/mocks/",
    ),
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: "(^|/)(dist|node_modules)/|\\.(test|spec)\\.[cm]?[jt]sx?$",
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.dependencies.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["types", "import", "default"],
    },
  },
};

module.exports = {
  messages: {
    type: "选择提交类型",
    scope: "选择影响范围",
    subject: "用中文简述改动",
    body: "说明做了什么以及为什么",
    breaking: "说明不兼容变更",
    footer: "关联任务编号，例如 T-002",
    confirmCommit: "确认提交以上内容？",
  },
  types: [
    {
      value: "feat",
      name: "feat: 新功能",
    },
    {
      value: "fix",
      name: "fix: 修复问题",
    },
    {
      value: "docs",
      name: "docs: 文档",
    },
    {
      value: "style",
      name: "style: 格式",
    },
    {
      value: "refactor",
      name: "refactor: 重构",
    },
    {
      value: "perf",
      name: "perf: 性能",
    },
    {
      value: "test",
      name: "test: 测试",
    },
    {
      value: "build",
      name: "build: 工程与依赖",
    },
    {
      value: "ci",
      name: "ci: 持续集成",
    },
    {
      value: "chore",
      name: "chore: 维护",
    },
    {
      value: "revert",
      name: "revert: 回退",
    },
  ],
  scopes: [
    "server",
    "worker",
    "web",
    "contracts",
    "domain",
    "db",
    "deploy",
    "docs",
  ],
  allowCustomScopes: false,
  allowEmptyScopes: false,
  skipQuestions: ["breaking"],
  issuePrefixes: [
    {
      value: "Refs:",
      name: "Refs: 关联开发任务",
    },
  ],
  allowCustomIssuePrefix: false,
  allowEmptyIssuePrefix: false,
};

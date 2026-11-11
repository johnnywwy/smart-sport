module.exports = {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "chinese-subject": ({ subject }) => [
          Boolean(subject && /\p{Script=Han}/u.test(subject)),
          "提交说明需要包含中文",
        ],
        "task-reference": ({ raw }) => [
          /^Refs: T-\d{3,}$/m.test(raw),
          "最后请添加 Refs: T-xxx",
        ],
      },
    },
  ],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "server",
        "worker",
        "web",
        "contracts",
        "domain",
        "db",
        "deploy",
        "docs",
      ],
    ],
    "scope-empty": [2, "never"],
    "subject-case": [0],
    "body-empty": [2, "never"],
    "chinese-subject": [2, "always"],
    "task-reference": [2, "always"],
  },
};

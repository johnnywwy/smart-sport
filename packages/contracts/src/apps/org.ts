import { defineApp } from "./define-app.js";

export const orgApp = defineApp({
  code: "org",
  name: "组织与权限",
  description: "维护部门、成员、身份和角色权限",
  icon: "users",
  identityTypes: ["company", "bureau", "agent", "school"],
  sort: 30,
  features: {
    department: {
      name: "部门",
      actions: ["view", "create", "update", "delete"],
    },
    member: {
      name: "成员与身份",
      actions: ["view", "create", "update", "delete", "import", "export"],
    },
    role: { name: "角色", actions: ["view", "create", "update", "delete"] },
    audit: { name: "本组织审计", actions: ["view", "export"] },
  },
  menus: [
    {
      key: "department",
      name: "组织架构",
      path: "/departments",
      icon: "git-branch",
      feature: "department",
      sort: 10,
    },
    {
      key: "member",
      name: "成员与身份",
      path: "/members",
      icon: "users",
      feature: "member",
      sort: 20,
    },
    {
      key: "role",
      name: "角色权限",
      path: "/roles",
      icon: "shield",
      feature: "role",
      sort: 30,
    },
    {
      key: "audit",
      name: "本组织审计",
      path: "/audits",
      icon: "history",
      feature: "audit",
      sort: 40,
    },
  ],
});

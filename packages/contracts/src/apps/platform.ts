import { defineApp } from "./define-app.js";

export const platformApp = defineApp({
  code: "platform",
  name: "机构管理",
  description: "管理平台组织、学校开通和服务授权",
  icon: "building",
  identityTypes: ["company"],
  sort: 20,
  features: {
    org: { name: "组织", actions: ["view", "create", "update", "export"] },
    onboarding: { name: "学校开通", actions: ["view", "create", "update"] },
    subscription: {
      name: "服务与应用",
      actions: ["view", "create", "update", "export", "approve"],
    },
    grant: { name: "代理商授权总览", actions: ["view", "export"] },
  },
  menus: [
    {
      key: "org",
      name: "组织列表",
      path: "/organizations",
      icon: "building",
      feature: "org",
      sort: 10,
    },
    {
      key: "onboarding",
      name: "学校开通",
      path: "/school-onboarding",
      icon: "school",
      feature: "onboarding",
      sort: 20,
    },
    {
      key: "subscription",
      name: "服务与应用",
      path: "/subscriptions",
      icon: "package",
      feature: "subscription",
      sort: 30,
    },
    {
      key: "grant",
      name: "代理商授权总览",
      path: "/agent-grants",
      icon: "handshake",
      feature: "grant",
      sort: 40,
    },
  ],
});

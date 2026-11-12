import type { PermissionCode } from "../permissions.js";
import { defineApp } from "./define-app.js";

export const schoolApp = defineApp({
  code: "school",
  name: "学校基础数据",
  description: "维护学校档案、班级、学生和教师数据",
  icon: "graduation-cap",
  identityTypes: ["school", "teacher", "company", "agent"],
  sort: 50,
  features: {
    profile: { name: "学校档案", actions: ["view", "update"] },
    class: {
      name: "行政班",
      actions: ["view", "create", "update", "delete", "import", "export"],
    },
    "teaching-class": {
      name: "教学班",
      actions: ["view", "create", "update", "delete", "import", "export"],
    },
    college: {
      name: "院系专业",
      actions: ["view", "create", "update", "delete"],
    },
    student: {
      name: "学生",
      actions: [
        "view",
        "create",
        "update",
        "delete",
        "import",
        "export",
        "sensitive",
      ],
    },
    teacher: {
      name: "教师与任课",
      actions: [
        "view",
        "create",
        "update",
        "delete",
        "import",
        "export",
        "sensitive",
      ],
    },
    rollover: { name: "学年切换", actions: ["view", "update"] },
    transfer: {
      name: "转学",
      actions: ["view", "create", "update", "approve"],
    },
    "agent-grant": {
      name: "代理商授权",
      actions: ["view", "create", "update", "delete"],
    },
  },
  menus: [
    {
      key: "profile",
      name: "学校档案",
      path: "/profile",
      icon: "school",
      feature: "profile",
      sort: 10,
    },
    {
      key: "class",
      name: "行政班",
      path: "/classes",
      icon: "users",
      feature: "class",
      sort: 20,
    },
    {
      key: "teaching-class",
      name: "教学班",
      path: "/teaching-classes",
      icon: "presentation",
      feature: "teaching-class",
      sort: 30,
    },
    {
      key: "college",
      name: "院系专业",
      path: "/colleges",
      icon: "building",
      feature: "college",
      sort: 40,
    },
    {
      key: "student",
      name: "学生",
      path: "/students",
      icon: "user",
      feature: "student",
      sort: 50,
    },
    {
      key: "teacher",
      name: "教师与任课",
      path: "/teachers",
      icon: "user-check",
      feature: "teacher",
      sort: 60,
    },
    {
      key: "rollover",
      name: "学年切换",
      path: "/rollover",
      icon: "refresh",
      feature: "rollover",
      sort: 70,
    },
    {
      key: "transfer",
      name: "转学",
      path: "/transfers",
      icon: "arrow-right-left",
      feature: "transfer",
      sort: 80,
    },
    {
      key: "agent-grant",
      name: "代理商授权",
      path: "/agent-grants",
      icon: "handshake",
      feature: "agent-grant",
      sort: 90,
    },
  ],
});

const agentDelegableFeatures = [
  "class",
  "teaching-class",
  "student",
  "teacher",
] as const;
const agentDelegableActions = [
  "view",
  "create",
  "update",
  "import",
  "export",
] as const;

export const agentDelegablePermissions = agentDelegableFeatures.flatMap(
  (feature) =>
    agentDelegableActions.map(
      (action): PermissionCode => `school:${feature}:${action}`,
    ),
);

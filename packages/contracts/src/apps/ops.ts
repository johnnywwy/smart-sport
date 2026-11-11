import { defineApp } from "./define-app.js";

export const opsApp = defineApp({
  code: "ops",
  name: "学校运营",
  description: "查看负责范围内的学校并进入学校业务",
  icon: "school",
  identityTypes: ["company", "bureau", "agent"],
  sort: 40,
  features: {
    school: { name: "学校列表", actions: ["view", "export"] },
  },
  menus: [
    {
      key: "school",
      name: "学校列表",
      path: "/schools",
      icon: "school",
      feature: "school",
      sort: 10,
    },
  ],
});

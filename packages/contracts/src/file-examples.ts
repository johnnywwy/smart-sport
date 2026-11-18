import { fileDownloadSchema, storedFileSchema } from "./files.js";
export const storedFileExample = storedFileSchema.parse({
  id: "019aa000-0000-7000-8000-000000000001",
  filename: "学生导入.xlsx",
  contentType:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  size: 4096,
  schoolId: null,
  purpose: "import",
  createdAt: "2026-11-18T08:00:00Z",
  expiresAt: "2026-11-19T08:00:00Z",
  allowedActions: [],
});
export const fileDownloadExample = fileDownloadSchema.parse({
  url: "https://files.example.com/private/example",
  expiresAt: "2026-11-18T08:05:00Z",
});

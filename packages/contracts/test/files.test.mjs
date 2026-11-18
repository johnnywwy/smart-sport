import assert from "node:assert/strict";
import test from "node:test";
import {
  fileDownloadExample,
  storedFileExample,
} from "../dist/file-examples.js";
import {
  fileDownloadSchema,
  fileUploadFieldsSchema,
  MAX_IMPORT_ROWS,
  MAX_UPLOAD_BYTES,
  storedFileSchema,
} from "../dist/index.js";

test("上传仅声明导入用途，不接受对象路径和身份归属，支持20MiB边界", () => {
  assert.equal(MAX_UPLOAD_BYTES, 20 * 1024 * 1024);
  assert.equal(MAX_IMPORT_ROWS, 10_000);
  assert.ok(fileUploadFieldsSchema.safeParse({ purpose: "import" }).success);
  assert.equal(
    fileUploadFieldsSchema.safeParse({ purpose: "export" }).success,
    false,
  );
  assert.equal(
    fileUploadFieldsSchema.safeParse({
      purpose: "import",
      objectKey: "foreign",
    }).success,
    false,
  );
  for (const size of [0, MAX_UPLOAD_BYTES + 1])
    assert.equal(
      storedFileSchema.safeParse({ ...storedFileExample, size }).success,
      false,
    );
  assert.ok(
    storedFileSchema.safeParse({ ...storedFileExample, size: MAX_UPLOAD_BYTES })
      .success,
  );
  assert.ok(
    storedFileSchema.safeParse({
      ...storedFileExample,
      filename: "旧版.xls",
      contentType: "application/vnd.ms-excel",
    }).success,
  );
});
test("文件响应无存储密钥或写能力，下载只允许HTTP临时链接", () => {
  assert.ok(storedFileSchema.safeParse(storedFileExample).success);
  assert.ok(fileDownloadSchema.safeParse(fileDownloadExample).success);
  assert.equal(
    fileDownloadSchema.safeParse({
      ...fileDownloadExample,
      url: "javascript:alert(1)",
    }).success,
    false,
  );
  assert.equal(
    storedFileSchema.safeParse({
      ...storedFileExample,
      objectKey: "private",
      allowedActions: ["delete"],
    }).success,
    false,
  );
});

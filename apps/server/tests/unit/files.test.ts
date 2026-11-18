import { MAX_UPLOAD_BYTES } from "@smart-sport/contracts";
import { expect, it } from "vitest";
import { validateExcelFile } from "../../src/modules/foundation/files/excel-file.js";
import { xlsFixture, xlsxFixture } from "../helpers/excel-files.js";

const file = (
  buffer: Buffer,
  name = "导入.xlsx",
  mime = "application/octet-stream",
) => ({ buffer, size: buffer.length, originalname: name, mimetype: mime });
it("xlsx与xls校验真实结构，输出标准MIME和内容哈希，允许大写扩展名", async () => {
  expect(await validateExcelFile(file(xlsxFixture()))).toMatchObject({
    filename: "导入.xlsx",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  expect(await validateExcelFile(file(xlsFixture(), "旧版.XLS"))).toMatchObject(
    { filename: "旧版.XLS", contentType: "application/vnd.ms-excel" },
  );
  expect((await validateExcelFile(file(xlsxFixture()))).sha256).toMatch(
    /^[a-f0-9]{64}$/,
  );
});
it("拒绝空文件、伪装后缀、错误MIME、Word复合文档、路径和控制字符", async () => {
  for (const f of [
    undefined,
    file(Buffer.alloc(0)),
    file(Buffer.from("不是Excel")),
    file(xlsxFixture(), "test.exe"),
    file(xlsFixture(), "test.xlsx"),
    file(xlsxFixture(), "test.xls"),
    file(xlsFixture("WordDocument"), "test.xls"),
    file(xlsxFixture(), "a.xlsx", "text/plain"),
    file(xlsxFixture(), "../a.xlsx"),
    file(xlsxFixture(), "a\n.xlsx"),
  ])
    await expect(validateExcelFile(f)).rejects.toMatchObject({ code: 90001 });
});
it("20MiB包含边界，超过一字节拒绝，不以声明长度绕过限制", async () => {
  const exact = xlsxFixture(MAX_UPLOAD_BYTES - xlsxFixture().length);
  expect((await validateExcelFile(file(exact))).size).toBe(MAX_UPLOAD_BYTES);
  await expect(
    validateExcelFile(file(Buffer.alloc(MAX_UPLOAD_BYTES + 1))),
  ).rejects.toMatchObject({ code: 90006 });
  await expect(
    validateExcelFile({ ...file(exact), size: 1 }),
  ).rejects.toMatchObject({ code: 90001 });
});
it("损坏的OLE目录链和越界指针有界退出", async () => {
  const cyclic = xlsFixture("WordDocument");
  cyclic.writeUInt32LE(1, 516);
  const outside = xlsFixture();
  outside.writeUInt32LE(999999, 48);
  for (const b of [cyclic, outside, xlsFixture().subarray(0, 100)])
    await expect(validateExcelFile(file(b, "a.xls"))).rejects.toMatchObject({
      code: 90001,
    });
});

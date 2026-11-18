import { createHash } from "node:crypto";
import { FileTypeValidator } from "@nestjs/common";
import { MAX_UPLOAD_BYTES } from "@smart-sport/contracts";
import { ApiException, invalidRequest } from "../../../api-response.js";

export type UploadFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};
const xlsxMime =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const xlsMime = "application/vnd.ms-excel";
const xlsxValidator = new FileTypeValidator({ fileType: xlsxMime });
const bad = () => invalidRequest([{ path: ["file"] }]);

/** 只遍历OLE目录链，拒绝把Word等复合文档改后缀当作xls；BIFF业务解析归导入任务。 */
function hasWorkbookDirectory(buffer: Buffer) {
  if (
    buffer.length < 512 ||
    buffer.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1"
  )
    return false;
  const version = buffer.readUInt16LE(26);
  const shift = buffer.readUInt16LE(30);
  if (
    buffer.readUInt16LE(28) !== 0xfffe ||
    !((version === 3 && shift === 9) || (version === 4 && shift === 12))
  )
    return false;
  const size = 2 ** shift;
  if (buffer.length % size !== 0) return false;
  const sectors = buffer.length / size - 1;
  const fatCount = buffer.readUInt32LE(44);
  if (!fatCount || fatCount > sectors) return false;
  const sector = (id: number) =>
    id < sectors
      ? buffer.subarray((id + 1) * size, (id + 2) * size)
      : undefined;
  const fatIds: number[] = [];
  for (let i = 0; i < Math.min(fatCount, 109); i++)
    fatIds.push(buffer.readUInt32LE(76 + i * 4));
  let difatId = buffer.readUInt32LE(68);
  const difatSeen = new Set<number>();
  while (fatIds.length < fatCount) {
    if (difatSeen.has(difatId) || difatSeen.size >= sectors) return false;
    difatSeen.add(difatId);
    const difat = sector(difatId);
    if (!difat) return false;
    for (let i = 0; i < size / 4 - 1 && fatIds.length < fatCount; i++)
      fatIds.push(difat.readUInt32LE(i * 4));
    difatId = difat.readUInt32LE(size - 4);
  }
  const visited = new Set<number>();
  let id = buffer.readUInt32LE(48);
  while (id !== 0xfffffffe) {
    if (visited.has(id) || visited.size >= sectors) return false;
    visited.add(id);
    const dir = sector(id);
    if (!dir) return false;
    for (let offset = 0; offset < size; offset += 128) {
      const length = dir.readUInt16LE(offset + 64);
      if (dir[offset + 66] !== 2 || length < 4 || length > 64 || length % 2)
        continue;
      const name = dir
        .subarray(offset, offset + length - 2)
        .toString("utf16le");
      if (name !== "Workbook" && name !== "Book") continue;
      const streamId = dir.readUInt32LE(offset + 116);
      const streamSize = dir.readBigUInt64LE(offset + 120);
      if (
        streamSize > 0n &&
        streamSize <= BigInt(buffer.length) &&
        streamId < sectors
      )
        return true;
    }
    const fatIndex = Math.floor(id / (size / 4));
    if (fatIndex >= fatCount) return false;
    const fat = sector(fatIds[fatIndex] ?? sectors);
    if (!fat) return false;
    id = fat.readUInt32LE((id % (size / 4)) * 4);
  }
  return false;
}

/** 文件格式检测不信任客户端MIME；此处不解压业务数据、不执行宏或公式。 */
export async function validateExcelFile(file: UploadFile | undefined) {
  if (!file?.buffer?.length || file.size !== file.buffer.length) throw bad();
  if (file.buffer.length > MAX_UPLOAD_BYTES) throw new ApiException(90006);
  const filename = file.originalname.normalize("NFC");
  if (
    !filename ||
    filename.length > 255 ||
    /[/\\]/.test(filename) ||
    [...filename].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw bad();
  const extension = /\.([^.]+)$/.exec(filename)?.[1]?.toLowerCase();
  const contentType =
    extension === "xlsx" ? xlsxMime : extension === "xls" ? xlsMime : null;
  if (
    !contentType ||
    ![contentType, "application/octet-stream"].includes(file.mimetype)
  )
    throw bad();
  const valid =
    extension === "xlsx"
      ? await xlsxValidator.isValid(file)
      : hasWorkbookDirectory(file.buffer);
  if (!valid) throw bad();
  return {
    filename,
    buffer: file.buffer,
    contentType,
    size: file.buffer.length,
    sha256: createHash("sha256").update(file.buffer).digest("hex"),
  };
}

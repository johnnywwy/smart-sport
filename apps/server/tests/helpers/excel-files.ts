import { crc32 } from "node:zlib";
/** 最小OOXML工作簿，用于真实multipart和存储回读，不依赖电子表格解析库。 */
export function xlsxFixture(padding = 0) {
  const files = [
    [
      "[Content_Types].xml",
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    ],
    [
      "xl/workbook.xml",
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="导入" sheetId="1"/></sheets></workbook>',
    ],
    [
      "xl/worksheets/sheet1.xml",
      '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
    ],
    ["padding.bin", " ".repeat(padding)],
  ];
  const chunks: Buffer[] = [],
    directory: Buffer[] = [];
  let offset = 0;
  for (const [filename, content] of files) {
    const name = Buffer.from(filename ?? "");
    const data = Buffer.from(content ?? "");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    chunks.push(local, name, data);
    directory.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const central = Buffer.concat(directory),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, central, end]);
}
/** OLE v3容器及BIFF8工作簿头，工作簿流使用普通扇区链。 */
export function xlsFixture(workbook = "Workbook") {
  const b = Buffer.alloc(512 * 11);
  Buffer.from("d0cf11e0a1b11ae1", "hex").copy(b);
  b.writeUInt16LE(0x3e, 24);
  b.writeUInt16LE(3, 26);
  b.writeUInt16LE(0xfffe, 28);
  b.writeUInt16LE(9, 30);
  b.writeUInt16LE(6, 32);
  b.writeUInt32LE(1, 44);
  b.writeUInt32LE(1, 48);
  b.writeUInt32LE(4096, 56);
  b.writeUInt32LE(0xfffffffe, 60);
  b.writeUInt32LE(0xfffffffe, 68);
  for (let i = 0; i < 109; i++) b.writeUInt32LE(0xffffffff, 76 + i * 4);
  b.writeUInt32LE(0, 76);
  for (let i = 0; i < 128; i++) b.writeUInt32LE(0xffffffff, 512 + i * 4);
  b.writeUInt32LE(0xfffffffd, 512);
  b.writeUInt32LE(0xfffffffe, 516);
  for (let i = 2; i < 10; i++)
    b.writeUInt32LE(i === 9 ? 0xfffffffe : i + 1, 512 + i * 4);
  const entry = (
    offset: number,
    name: string,
    type: number,
    start: number,
    size: bigint,
  ) => {
    Buffer.from(`${name}\0`, "utf16le").copy(b, offset);
    b.writeUInt16LE((name.length + 1) * 2, offset + 64);
    b[offset + 66] = type;
    b[offset + 67] = 1;
    for (const relative of [68, 72, 76])
      b.writeUInt32LE(0xffffffff, offset + relative);
    b.writeUInt32LE(start, offset + 116);
    b.writeBigUInt64LE(size, offset + 120);
  };
  entry(1024, "Root Entry", 5, 0xfffffffe, 0n);
  b.writeUInt32LE(1, 1024 + 76);
  entry(1152, workbook, 2, 2, 4096n);
  b.writeUInt16LE(0x0809, 1536);
  b.writeUInt16LE(16, 1538);
  b.writeUInt16LE(0x0600, 1540);
  b.writeUInt16LE(0x0005, 1542);
  b.writeUInt16LE(0x000a, 1556);
  return b;
}

import fs from "node:fs/promises";
import path from "node:path";
import { toZipPath, walkFiles } from "./fs-utils.js";

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function shouldInclude(root, outputPath, absolutePath) {
  if (absolutePath === outputPath) return false;
  const rel = path.relative(root, absolutePath);
  if (rel.endsWith(".icuewidget")) return false;
  return rel.split(path.sep).every((part) => part && !part.startsWith(".") && part !== "__pycache__");
}

export async function createPackage(widgetDir, outputPath) {
  const root = path.resolve(widgetDir);
  const output = path.resolve(outputPath);
  await fs.mkdir(path.dirname(output), { recursive: true });

  const filePaths = (await walkFiles(root)).filter((file) => shouldInclude(root, output, path.resolve(file))).sort();
  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, day } = dosDateTime();

  for (const filePath of filePaths) {
    const data = await fs.readFile(filePath);
    const name = Buffer.from(toZipPath(path.relative(root, filePath)), "utf8");
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(time), u16(day),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name,
    ]);
    chunks.push(local, data);
    central.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(time), u16(day),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += local.length + data.length;
  }

  const centralStart = offset;
  const centralData = Buffer.concat(central);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
    u32(centralData.length), u32(centralStart), u16(0),
  ]);
  await fs.writeFile(output, Buffer.concat([...chunks, centralData, end]));
}

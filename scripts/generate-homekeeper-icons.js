const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(
  root,
  "homekeeper",
  "assets",
  "homekeeper-porcelain-cameo-master.png"
);
const publicDir = path.join(root, "homekeeper", "public");

const iconTargets = [
  ["icon.png", 512],
  ["icon-512.png", 512],
  ["icon-192.png", 192],
  ["icon-maskable-512.png", 512],
  ["icon-maskable-192.png", 192],
  ["apple-touch-icon.png", 180],
  ["favicon-32.png", 32],
  ["favicon-16.png", 16],
];

function icoBuffer(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  let offset = header.length + entries.length * 16;
  const directory = [];

  for (const entry of entries) {
    const record = Buffer.alloc(16);
    record.writeUInt8(entry.size === 256 ? 0 : entry.size, 0);
    record.writeUInt8(entry.size === 256 ? 0 : entry.size, 1);
    record.writeUInt8(0, 2);
    record.writeUInt8(0, 3);
    record.writeUInt16LE(1, 4);
    record.writeUInt16LE(32, 6);
    record.writeUInt32LE(entry.buffer.length, 8);
    record.writeUInt32LE(offset, 12);
    directory.push(record);
    offset += entry.buffer.length;
  }

  return Buffer.concat([header, ...directory, ...entries.map((entry) => entry.buffer)]);
}

async function renderPng(fileName, size) {
  await sharp(sourcePath)
    .resize(size, size, {
      fit: "cover",
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDir, fileName));
}

async function main() {
  fs.mkdirSync(publicDir, { recursive: true });

  const metadata = await sharp(sourcePath).metadata();
  if (metadata.width !== metadata.height) {
    throw new Error("Homekeeper icon master must be square.");
  }

  for (const [fileName, size] of iconTargets) {
    await renderPng(fileName, size);
  }

  const faviconEntries = await Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      buffer: await sharp(sourcePath)
        .resize(size, size, { fit: "cover", kernel: sharp.kernel.lanczos3 })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    }))
  );
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuffer(faviconEntries));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

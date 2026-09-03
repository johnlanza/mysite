const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "homekeeper", "public");

const field = "#c84c0b";
const fieldDeep = "#a93b08";
const fieldGlow = "#e06516";
const raised = "#ff9a42";
const raisedLight = "#ffc07d";
const raisedShade = "#ef7d24";

const housePath = [
  "M198 718",
  "L198 538",
  "Q198 516 181 532",
  "L158 553",
  "Q137 574 114 554",
  "Q92 535 116 512",
  "L462 178",
  "Q512 130 562 178",
  "L704 316",
  "L704 291",
  "Q704 257 738 257",
  "L812 257",
  "Q846 257 846 291",
  "L846 455",
  "L908 512",
  "Q932 535 910 554",
  "Q887 574 866 553",
  "L846 535",
  "L846 718",
  "Q846 858 706 858",
  "L626 858",
  "Q562 858 562 794",
  "L562 671",
  "Q562 624 512 624",
  "Q462 624 462 671",
  "L462 794",
  "Q462 858 398 858",
  "L318 858",
  "Q198 858 198 718",
  "Z",
].join(" ");

const doorPath = [
  "M461 802",
  "L461 682",
  "Q461 613 512 613",
  "Q563 613 563 682",
  "L563 802",
  "Q563 826 539 826",
  "L485 826",
  "Q461 826 461 802",
  "Z",
].join(" ");

function svg({ maskable = false } = {}) {
  const inset = maskable ? 0 : 56;
  const radius = maskable ? 205 : 150;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="field" x1="184" y1="101" x2="824" y2="914" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${fieldGlow}"/>
      <stop offset="0.45" stop-color="${field}"/>
      <stop offset="1" stop-color="${fieldDeep}"/>
    </linearGradient>
    <radialGradient id="fieldLight" cx="33%" cy="18%" r="78%">
      <stop offset="0" stop-color="#f47c2b" stop-opacity="0.62"/>
      <stop offset="0.56" stop-color="#d25410" stop-opacity="0.2"/>
      <stop offset="1" stop-color="#8f3008" stop-opacity="0.3"/>
    </radialGradient>
    <linearGradient id="raised" x1="330" y1="210" x2="682" y2="842" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${raisedLight}"/>
      <stop offset="0.5" stop-color="${raised}"/>
      <stop offset="1" stop-color="${raisedShade}"/>
    </linearGradient>
    <filter id="fieldShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#5c1f05" flood-opacity="0.34"/>
    </filter>
    <filter id="raisedRelief" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="19" stdDeviation="15" flood-color="#7f2b07" flood-opacity="0.44"/>
      <feDropShadow dx="-5" dy="-8" stdDeviation="8" flood-color="#ffd0a0" flood-opacity="0.2"/>
    </filter>
    <filter id="doorInset" x="-35%" y="-35%" width="170%" height="170%">
      <feDropShadow dx="0" dy="-8" stdDeviation="7" flood-color="#6f2505" flood-opacity="0.62"/>
      <feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#ffb064" flood-opacity="0.2"/>
    </filter>
  </defs>
  <rect x="${inset}" y="${inset}" width="${1024 - inset * 2}" height="${1024 - inset * 2}" rx="${radius}" fill="url(#field)" filter="url(#fieldShadow)"/>
  <rect x="${inset + 7}" y="${inset + 7}" width="${1024 - inset * 2 - 14}" height="${1024 - inset * 2 - 14}" rx="${Math.max(0, radius - 7)}" fill="url(#fieldLight)" opacity="0.72"/>
  <path d="${housePath}" fill="url(#raised)" filter="url(#raisedRelief)"/>
  <path d="${housePath}" fill="none" stroke="#ffd3a4" stroke-opacity="0.28" stroke-width="13" stroke-linejoin="round"/>
  <path d="${doorPath}" fill="#b44108" filter="url(#doorInset)"/>
  <path d="${doorPath}" fill="none" stroke="#f78d39" stroke-opacity="0.22" stroke-width="10" stroke-linejoin="round"/>
</svg>`;
}

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

async function renderPng(fileName, size, options = {}) {
  const source = Buffer.from(svg({ maskable: options.maskable }));
  let image = sharp(source).resize(size, size, {
    fit: "contain",
    kernel: sharp.kernel.lanczos3,
  });

  if (options.background) {
    image = image.flatten({ background: options.background });
  }

  await image.png({ compressionLevel: 9 }).toFile(path.join(publicDir, fileName));
}

async function main() {
  fs.mkdirSync(publicDir, { recursive: true });

  await renderPng("icon.png", 512);
  await renderPng("icon-512.png", 512);
  await renderPng("icon-192.png", 192);
  await renderPng("icon-maskable-512.png", 512, { maskable: true, background: field });
  await renderPng("icon-maskable-192.png", 192, { maskable: true, background: field });
  await renderPng("apple-touch-icon.png", 180, { maskable: true, background: field });
  await renderPng("favicon-32.png", 32, { background: field });
  await renderPng("favicon-16.png", 16, { background: field });

  const faviconEntries = await Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      buffer: await sharp(Buffer.from(svg()))
        .resize(size, size, { fit: "contain", kernel: sharp.kernel.lanczos3 })
        .flatten({ background: field })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    })),
  );
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuffer(faviconEntries));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

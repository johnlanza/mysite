import crypto from "node:crypto";

const ZETTE_NAMESPACE = "2f8f54c5-27fd-4c12-9eaa-7f2e7d01f4ad";
const BLOCK_ID_PATTERN =
  /^\s*id::\s*([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\s*$/i;

function namespaceBytes() {
  return Buffer.from(ZETTE_NAMESPACE.replace(/-/g, ""), "hex");
}

function formatUuid(bytes) {
  return [
    bytes.subarray(0, 4).toString("hex"),
    bytes.subarray(4, 6).toString("hex"),
    bytes.subarray(6, 8).toString("hex"),
    bytes.subarray(8, 10).toString("hex"),
    bytes.subarray(10, 16).toString("hex"),
  ].join("-");
}

function createStableUuid(seed) {
  const hash = crypto
    .createHash("sha1")
    .update(namespaceBytes())
    .update(String(seed))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuid(bytes);
}

function indentationColumns(indent) {
  let columns = 0;

  for (const char of indent) {
    columns += char === "\t" ? 2 : 1;
  }

  return columns;
}

function blockIndentColumns(line) {
  const match = line.match(/^(\s*)-\s/);
  return indentationColumns(match?.[1] ?? line.match(/^\s*/)?.[0] ?? "");
}

function isBlockLine(line) {
  return /^\s*-\s/.test(line);
}

function isSiblingOrParentBlock(line, parentIndentColumns) {
  const match = line.match(/^(\s*)-\s/);

  return Boolean(match && indentationColumns(match[1]) <= parentIndentColumns);
}

export function findNearestBlockLineIndex(lines, lineIndex) {
  const line = lines[lineIndex] ?? "";

  if (isBlockLine(line)) {
    return lineIndex;
  }

  const currentIndent = indentationColumns(line.match(/^\s*/)?.[0] ?? "");

  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const candidate = lines[index] ?? "";

    if (!isBlockLine(candidate)) {
      continue;
    }

    if (blockIndentColumns(candidate) < currentIndent) {
      return index;
    }
  }

  return lineIndex;
}

export function findExistingBlockId(lines, lineIndex) {
  const blockLineIndex = findNearestBlockLineIndex(lines, lineIndex);
  const parentIndentColumns = blockIndentColumns(lines[blockLineIndex] ?? "");
  const propertyIndentColumns = parentIndentColumns + 2;

  for (
    let index = blockLineIndex + 1;
    index < Math.min(lines.length, blockLineIndex + 8);
    index += 1
  ) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (isSiblingOrParentBlock(line, parentIndentColumns)) {
      break;
    }

    const match = line.match(BLOCK_ID_PATTERN);
    if (
      match &&
      indentationColumns(line.match(/^\s*/)?.[0] ?? "") === propertyIndentColumns
    ) {
      return match[1].toLowerCase();
    }
  }

  return null;
}

export function planLogseqBlockId(lines, lineIndex, seedParts, plans) {
  const blockLineIndex = findNearestBlockLineIndex(lines, lineIndex);
  const existing = findExistingBlockId(lines, blockLineIndex);
  if (existing) {
    return existing;
  }

  const planned = plans.get(blockLineIndex);
  if (planned) {
    return planned;
  }

  const id = createStableUuid(seedParts.join("\u001f"));
  plans.set(blockLineIndex, id);

  return id;
}

export function applyLogseqBlockIdPlans(lines, plans) {
  let changed = false;
  const sortedPlans = [...plans.entries()].sort(
    ([leftIndex], [rightIndex]) => rightIndex - leftIndex,
  );

  for (const [lineIndex, blockId] of sortedPlans) {
    if (findExistingBlockId(lines, lineIndex)) {
      continue;
    }

    const indent = lines[lineIndex].match(/^\s*/)?.[0] ?? "";
    lines.splice(lineIndex + 1, 0, `${indent}  id:: ${blockId}`);
    changed = true;
  }

  return changed;
}

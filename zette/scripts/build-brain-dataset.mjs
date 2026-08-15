#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const SOURCE_DIRECTORIES = [
  {
    type: "journals",
    dir: "/Users/johnlanza/Library/Mobile Documents/iCloud~com~logseq~logseq/Documents/journals",
  },
  {
    type: "pages",
    dir: "/Users/johnlanza/Library/Mobile Documents/iCloud~com~logseq~logseq/Documents/pages",
  },
];

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUTPUT_FILE = path.join(ROOT, "src/data/brain.json");
const TAG_PATTERN = /(?:^|\s)#(?:\[\[([^\]]+)\]\]|([a-zA-Z0-9/_-]+))/g;
const PAGE_REF_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const CURATED_MARKER_PATTERN = /#?\[\[(?:My Quotes|My Questions)\]\]/i;
const MY_WORDS_PATTERN =
  /(?<![\p{L}\p{N}_])(?:#(?:\[\[(?:mw|mywords)\]\]|mw|mywords)\b|\[\[(?:mw|mywords)\]\])/iu;
const SIGNAL_TAGS = new Set([
  "bias",
  "business",
  "decision making",
  "enough",
  "habits",
  "idea",
  "life",
  "mw",
  "my affirmations",
  "mywords",
  "ponder",
  "post",
  "profound",
  "sales",
  "speaking",
  "surprise",
  "writing",
]);
const SOURCE_REF_ALLOWLIST = new Set([
  "tim ferriss",
  "james clear",
  "farnam street",
  "ryan holiday",
  "the profile",
  "maria popova",
  "psyche",
  "founders podcast",
  "waking up",
]);
const SENSITIVE_PATTERN =
  /\b(?:api key|door code|password|passcode|pin|private key|schlage code|secret|ssn|token)\b|(?:^|\s)code:/i;

function decodeFileName(fileName) {
  return decodeURIComponent(fileName.replace(/\.md$/i, ""));
}

function cleanupInlineMarkup(value) {
  return value
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, " ")
    .replace(/\{\{renderer [^}]+\}\}/g, " ")
    .replace(/\{\{[^}]+\}\}/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/(?:\*\*|__|`|~~)/g, "")
    .replace(/(?:==|\^\^)/g, "")
    .replace(/\b[a-z-]+::/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectTags(text) {
  const tags = new Set();

  for (const match of text.matchAll(TAG_PATTERN)) {
    const tag = (match[1] ?? match[2] ?? "").trim().toLowerCase();

    if (!tag || tag === "my quotes" || tag === "my questions") {
      continue;
    }

    tags.add(tag);
  }

  return [...tags].sort();
}

function collectRefs(text) {
  const refs = new Set();

  for (const match of text.matchAll(PAGE_REF_PATTERN)) {
    const ref = (match[2] ?? match[1] ?? "").trim();
    const normalized = ref.toLowerCase();

    if (
      !ref ||
      normalized === "my quotes" ||
      normalized === "my questions" ||
      SOURCE_REF_ALLOWLIST.has(normalized)
    ) {
      continue;
    }

    if (/^[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th),\s+\d{4}$/.test(ref)) {
      continue;
    }

    refs.add(ref);
  }

  return [...refs].sort((left, right) => left.localeCompare(right));
}

function stripBrainMarkers(value) {
  return cleanupInlineMarkup(
    value
      .replace(CURATED_MARKER_PATTERN, " ")
      .replace(TAG_PATTERN, " ")
      .replace(/\[\[[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th),\s+\d{4}\]\]/g, " ")
      .replace(/^[\s>*-]+/, " ")
      .replace(/^\s*(?:TODO|DOING|DONE|NOW|LATER|WAITING|CANCELED)\s+/i, " ")
      .replace(/\s+/g, " "),
  );
}

function sourceDisplayFor(originType, originFile) {
  const pageTitle = decodeFileName(originFile);

  if (originType === "journals") {
    return pageTitle;
  }

  return pageTitle.split(" | ")[0]?.trim() ?? pageTitle;
}

function isMetaLine(line) {
  return /^\s*(?:id|source-id|collapsed|type|cover|link|author|title|notes|summary|tags|tags-note|source|alias|template)::/i.test(
    line,
  );
}

function isNoiseLine(text) {
  if (!text) {
    return true;
  }

  if (text.length < 40 || text.length > 900 || wordCount(text) < 7) {
    return true;
  }

  if (/^https?:\/\//i.test(text) || /^www\./i.test(text)) {
    return true;
  }

  if (/^\d{1,2}:\d{2}\b/.test(text) || /^[A-Z][a-z]{2}\s+\d{1,2}\b/.test(text)) {
    return true;
  }

  if (/^(?:done|todo|later|now|waiting|canceled)$/i.test(text)) {
    return true;
  }

  return false;
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function getExistingBlockId(lines, lineIndex) {
  for (
    let index = lineIndex + 1;
    index <= Math.min(lines.length - 1, lineIndex + 3);
    index += 1
  ) {
    const match = lines[index].match(/^\s*id::\s*(.+?)\s*$/i);

    if (match?.[1]) {
      return match[1].trim();
    }

    if (lines[index].trim() && !/^\s*(?:source-id|collapsed)::/i.test(lines[index])) {
      break;
    }
  }

  return null;
}

function getSourceLocator(originType, lineIndex) {
  return originType === "journals" ? null : `Line ${lineIndex + 1}`;
}

function scoreCandidate(rawLine, text, tags, refs) {
  const reasons = [];
  let score = 0;
  const signalTags = tags.filter((tag) => SIGNAL_TAGS.has(tag));

  if (signalTags.length > 0) {
    score += Math.min(3, signalTags.length);
    reasons.push("signal-tag");
  }

  if (MY_WORDS_PATTERN.test(rawLine)) {
    score += 3;
    reasons.push("my-words");
  }

  if (/(?:==|\^\^|\*\*)/.test(rawLine)) {
    score += 2;
    reasons.push("highlighted");
  }

  if (/[“”"]/.test(rawLine)) {
    score += 1;
    reasons.push("quoted");
  }

  if (refs.length > 0) {
    score += 1;
    reasons.push("linked");
  }

  if (/\?/.test(text)) {
    score += 1;
    reasons.push("question");
  }

  if (/\b(?:because|therefore|means|should|must|cannot|important|wisdom|lesson|idea|insight|remember)\b/i.test(text)) {
    score += 1;
    reasons.push("reflection");
  }

  if (
    text.length >= 55 &&
    text.length <= 280 &&
    /[.!?]$/.test(text) &&
    /\b(?:always|cannot|never|only|should|must|better|best|important|true|truth)\b/i.test(text)
  ) {
    score += 1;
    reasons.push("aphoristic");
  }

  return {
    score,
    reasons: [...new Set(reasons)],
    candidate: score >= 3,
    semanticEligible: score >= 4,
  };
}

function buildId(originType, originFile, lineIndex) {
  return `${originType}:${originFile}:${lineIndex}`;
}

function buildSignature(record) {
  return [
    record.originFile,
    record.lineIndex,
    record.text.toLowerCase(),
  ].join("|");
}

async function readPreviousDataset() {
  try {
    const content = await fs.readFile(OUTPUT_FILE, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function getMarkdownFiles(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });

  return dirents
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(dir, entry.name));
}

async function main() {
  const previousDataset = await readPreviousDataset();
  const previousSignatures = new Set(
    (previousDataset?.records ?? []).map((record) => buildSignature(record)),
  );
  const previousNewSignatures = new Set(
    (previousDataset?.records ?? [])
      .filter((record) => record.review?.isNew)
      .map((record) => buildSignature(record)),
  );
  const allRecords = [];
  const seen = new Set();
  let skippedSensitive = 0;
  let scannedFiles = 0;

  for (const source of SOURCE_DIRECTORIES) {
    const files = await getMarkdownFiles(source.dir);

    for (const filePath of files) {
      scannedFiles += 1;
      const content = await fs.readFile(filePath, "utf8");
      const originFile = path.basename(filePath);
      const sourcePageTitle = decodeFileName(originFile);
      const sourceDisplay = sourceDisplayFor(source.type, originFile);
      const lines = content.split("\n");

      for (let index = 0; index < lines.length; index += 1) {
        const rawLine = lines[index];

        if (
          !rawLine.trim() ||
          isMetaLine(rawLine) ||
          /#\+BEGIN|#\+END/i.test(rawLine) ||
          CURATED_MARKER_PATTERN.test(rawLine)
        ) {
          continue;
        }

        if (SENSITIVE_PATTERN.test(rawLine)) {
          skippedSensitive += 1;
          continue;
        }

        const text = stripBrainMarkers(rawLine);

        if (isNoiseLine(text)) {
          continue;
        }

        const tags = collectTags(rawLine);
        const refs = collectRefs(rawLine);
        const search = scoreCandidate(rawLine, text, tags, refs);
        const dedupeKey = `${source.type}:${originFile}:${text.toLowerCase()}`;

        if (seen.has(dedupeKey)) {
          continue;
        }

        seen.add(dedupeKey);
        allRecords.push({
          id: buildId(source.type, originFile, index),
          text,
          note: null,
          sourcePageTitle,
          sourceDisplay,
          sourceLocator: getSourceLocator(source.type, index),
          blockId: getExistingBlockId(lines, index),
          tags,
          refs,
          originType: source.type,
          originFile,
          lineIndex: index,
          search,
        });
      }
    }
  }

  const records = allRecords
    .map((record) => {
      const signature = buildSignature(record);
      const flags = [];

      if (wordCount(record.text) < 10) {
        flags.push("short");
      }

      if (record.text.length > 520) {
        flags.push("long");
      }

      return {
        ...record,
        review: {
          isNew:
            previousNewSignatures.has(signature) ||
            !previousSignatures.has(signature),
          flags,
        },
      };
    })
    .sort((left, right) => {
      const scoreDiff = right.search.score - left.search.score;
      return scoreDiff || left.text.localeCompare(right.text);
    });
  const tagSet = new Set();
  const refSet = new Set();

  for (const record of records) {
    for (const tag of record.tags) tagSet.add(tag);
    for (const ref of record.refs) refSet.add(ref);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceDirectories: SOURCE_DIRECTORIES.map((entry) => entry.dir),
    tags: [...tagSet].sort(),
    refs: [...refSet].sort(),
    stats: {
      totalRecords: records.length,
      candidateRecords: records.filter((record) => record.search.candidate).length,
      semanticRecords: records.filter((record) => record.search.semanticEligible).length,
      skippedSensitive,
      scannedFiles,
      newRecords: records.filter((record) => record.review.isNew).length,
    },
    records,
  };

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2) + "\n");

  console.log(
    `Built ${records.length} brain records (${payload.stats.semanticRecords} semantic) into ${OUTPUT_FILE}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

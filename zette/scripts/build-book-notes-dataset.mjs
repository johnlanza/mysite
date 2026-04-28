import fs from "node:fs/promises";
import path from "node:path";

const PAGES_DIRECTORY =
  "/Users/johnlanza/Library/Mobile Documents/iCloud~com~logseq~logseq/Documents/pages";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUTPUT_FILE = path.join(ROOT, "src/data/book-notes.json");
const MY_QUOTES_PATTERN = /#?\[\[My Quotes\]\]/i;
const MY_WORDS_PATTERN = /(^|\s)#(?:\[\[(?:mw|mywords)\]\]|mw|mywords)\b/i;
const TAG_PATTERN = /(?:^|\s)#(?:\[\[([^\]]+)\]\]|([a-zA-Z0-9/_-]+))/g;
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

function collectImplicitTagRefs(text) {
  const pageRefPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const implicitRefs = [];

  for (const match of text.matchAll(pageRefPattern)) {
    const ref = (match[2] ?? match[1] ?? "").trim();
    const normalized = ref.toLowerCase();

    if (!ref || normalized === "my quotes" || SOURCE_REF_ALLOWLIST.has(normalized)) {
      continue;
    }

    if (text[(match.index ?? 0) - 1] === "#") {
      continue;
    }

    if (/^[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th),\s+\d{4}$/.test(ref)) {
      continue;
    }

    const leadingContext = cleanupInlineMarkup(
      text.slice(Math.max(0, (match.index ?? 0) - 32), match.index ?? 0),
    );

    if (/(?:^|\s)(from|source:|newsletter|episode|novel|book|podcast)\s*$/i.test(leadingContext)) {
      continue;
    }

    const isLowercaseCategory = ref === ref.toLowerCase();
    const isPersonalCategory = /^My\s+/i.test(ref);
    const isClusteredTitleTag =
      implicitRefs.length > 0 &&
      /^[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*$/.test(ref);

    if (isLowercaseCategory || isPersonalCategory || isClusteredTitleTag) {
      implicitRefs.push({
        raw: match[0],
        normalized,
      });
    }
  }

  return implicitRefs;
}

function collectTags(text) {
  const tags = new Set();

  for (const match of text.matchAll(TAG_PATTERN)) {
    const tag = (match[1] ?? match[2] ?? "").trim().toLowerCase();

    if (!tag || tag === "my quotes" || tag === "book" || /^\d+$/.test(tag)) {
      continue;
    }

    tags.add(tag);
  }

  for (const match of collectImplicitTagRefs(text)) {
    tags.add(match.normalized);
  }

  return [...tags].sort();
}

function stripTagsAndMarkers(value) {
  const split = splitMyWordsNote(value);
  let stripped = value
    .slice(0, split.markerStart ?? value.length)
    .replace(MY_QUOTES_PATTERN, " ")
    .replace(TAG_PATTERN, " ")
    .replace(/\[\[[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th),\s+\d{4}\]\]/g, " ")
    .replace(/^[\s>*-]+/, " ");

  for (const match of collectImplicitTagRefs(value)) {
    stripped = stripped.replace(match.raw, " ");
  }

  return cleanupInlineMarkup(stripped).trim();
}

function splitMyWordsNote(line) {
  const match = line.match(MY_WORDS_PATTERN);

  if (!match || match.index === undefined) {
    return {
      quoteLine: line,
      note: null,
      markerStart: null,
    };
  }

  const markerStart = match.index + match[1].length;
  const before = line.slice(0, markerStart);
  const after = line
    .slice(markerStart)
    .replace(/^#(?:\[\[(?:mw|mywords)\]\]|mw|mywords)\b/i, "");
  const cleanedNote = stripTagsAndMarkers(after)
    .replace(/^[:\-–—]\s*/, "")
    .trim();

  return {
    quoteLine: before,
    note: cleanedNote || null,
    markerStart,
  };
}

function combineNotes(notes) {
  const unique = [];
  const seen = new Set();

  for (const note of notes) {
    const cleaned = cleanupInlineMarkup(note ?? "").trim();

    if (!cleaned || seen.has(cleaned.toLowerCase())) {
      continue;
    }

    seen.add(cleaned.toLowerCase());
    unique.push(cleaned);
  }

  return unique.length > 0 ? unique.join(" ") : null;
}

function isBookPage(content) {
  return /Type::\s*\[\[book\]\]/i.test(content) || /(?:^|\s)#book(?:\s|$)/m.test(content);
}

function getMetadataValue(content, key) {
  const match = content.match(new RegExp(`^\\s*${key}::\\s*(.+)$`, "im"));
  return match ? cleanupInlineMarkup(match[1]) : null;
}

function deriveAuthorFromPageTitle(sourcePageTitle) {
  if (!sourcePageTitle.includes(" | ")) {
    return null;
  }

  const parts = sourcePageTitle.split(" | ").map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) ?? null;
}

function deriveTitleFromPageTitle(sourcePageTitle) {
  if (!sourcePageTitle.includes(" | ")) {
    return sourcePageTitle;
  }

  return sourcePageTitle.split(" | ")[0]?.trim() ?? sourcePageTitle;
}

function normalizeBookAuthor(value, sourcePageTitle) {
  const fallback = deriveAuthorFromPageTitle(sourcePageTitle);
  const cleaned = cleanupInlineMarkup(value ?? "");
  const candidate =
    fallback && /&|\band\b|,/.test(cleaned) ? fallback : cleaned || fallback;

  if (!candidate) {
    return "Unknown";
  }

  if (/^[^,]+,\s*[^,]+$/.test(candidate)) {
    const [last, first] = candidate.split(",").map((part) => part.trim());
    if (last && first) {
      return `${first} ${last}`;
    }
  }

  return candidate;
}

function isMetaLine(line) {
  return /^(yellow highlight\b|note:?$|note \| location:|location:|page:|type::|cover::|link::|author::|title::|notes::|summary::|collapsed::|##\s|copy and paste notes here\.?$)/i.test(
    line,
  );
}

function isTagOnlyLine(line) {
  return stripTagsAndMarkers(line) === "";
}

function normalizeBookNoteText(text) {
  return cleanupInlineMarkup(text)
    .replace(/^Note:\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function findAnchorEntry(lines, tagIndex) {
  const currentSplit = splitMyWordsNote(lines[tagIndex]);
  const current = normalizeBookNoteText(stripTagsAndMarkers(lines[tagIndex]));

  if (current && !isMetaLine(current) && wordCount(current) >= 6) {
    return {
      text: current,
      note: currentSplit.note,
    };
  }

  for (let index = tagIndex - 1; index >= Math.max(0, tagIndex - 4); index -= 1) {
    const candidateSplit = splitMyWordsNote(lines[index]);
    const candidate = normalizeBookNoteText(stripTagsAndMarkers(lines[index]));

    if (!candidate || isMetaLine(candidate) || isTagOnlyLine(lines[index])) {
      continue;
    }

    if (wordCount(candidate) >= 4) {
      const currentSuffix =
        current && !isMetaLine(current) && current !== candidate ? ` ${current}` : "";
      return {
        text: `${candidate}${currentSuffix}`.trim(),
        note: combineNotes([candidateSplit.note, currentSplit.note]),
      };
    }
  }

  if (current && !isMetaLine(current)) {
    return {
      text: current,
      note: currentSplit.note,
    };
  }

  for (let index = tagIndex + 1; index <= Math.min(lines.length - 1, tagIndex + 2); index += 1) {
    const candidateSplit = splitMyWordsNote(lines[index]);
    const candidate = normalizeBookNoteText(stripTagsAndMarkers(lines[index]));

    if (!candidate || isMetaLine(candidate) || isTagOnlyLine(lines[index])) {
      continue;
    }

    return {
      text: candidate,
      note: combineNotes([currentSplit.note, candidateSplit.note]),
    };
  }

  return {
    text: null,
    note: currentSplit.note,
  };
}

function isValidBookNoteText(text) {
  if (!text) {
    return false;
  }

  const normalized = normalizeBookNoteText(text);

  if (!normalized || normalized.length < 12 || normalized.length > 900) {
    return false;
  }

  if (wordCount(normalized) < 3) {
    return false;
  }

  if (/^\[\[book\]\]$/i.test(normalized)) {
    return false;
  }

  return true;
}

function buildId(originFile, lineIndex) {
  return `pages:${originFile}:${lineIndex}`;
}

function findNotesStartIndex(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*-?\s*##\s*Notes\b/i.test(lines[index])) {
      return index + 1;
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*-?\s*Select notes & quotes:/i.test(lines[index])) {
      return index + 1;
    }
  }

  return -1;
}

function buildSignature(note) {
  return [
    note.originFile,
    note.text.toLowerCase(),
    note.bookTitle.toLowerCase(),
    note.bookAuthor.toLowerCase(),
  ].join("|");
}

function getReviewFlags(note) {
  const flags = [];

  if (wordCount(note.text) < 6) {
    flags.push("short-note");
  }

  if (note.text.length > 420) {
    flags.push("long-note");
  }

  if (/yellow highlight|location:|page:/i.test(note.text)) {
    flags.push("meta-left-in-note");
  }

  return flags;
}

async function readPreviousDataset() {
  try {
    const content = await fs.readFile(OUTPUT_FILE, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function main() {
  const previousDataset = await readPreviousDataset();
  const previousSignatures = new Set(
    (previousDataset?.notes ?? []).map((note) => buildSignature(note)),
  );
  const dirents = await fs.readdir(PAGES_DIRECTORY, { withFileTypes: true });
  const allNotes = [];

  for (const dirent of dirents) {
    if (!dirent.isFile() || !dirent.name.endsWith(".md")) {
      continue;
    }

    const filePath = path.join(PAGES_DIRECTORY, dirent.name);
    const content = await fs.readFile(filePath, "utf8");

    if (!isBookPage(content)) {
      continue;
    }

    const originFile = dirent.name;
    const sourcePageTitle = decodeFileName(originFile);
    const bookTitle = getMetadataValue(content, "Title") ?? deriveTitleFromPageTitle(sourcePageTitle);
    const bookAuthor = normalizeBookAuthor(getMetadataValue(content, "Author"), sourcePageTitle);
    const lines = content.split("\n");
    const notesStartIndex = findNotesStartIndex(lines);

    if (notesStartIndex === -1) {
      continue;
    }

    for (let index = notesStartIndex; index < lines.length; index += 1) {
      const line = lines[index];

      if (MY_QUOTES_PATTERN.test(line)) {
        continue;
      }

      const tags = collectTags(line);

      if (tags.length === 0) {
        continue;
      }

      const anchor = findAnchorEntry(lines, index);
      const text = anchor.text;

      if (!isValidBookNoteText(text)) {
        continue;
      }

      allNotes.push({
        id: buildId(originFile, index),
        text: normalizeBookNoteText(text),
        note: anchor.note,
        bookTitle,
        bookAuthor,
        sourcePageTitle,
        sourceDisplay: bookTitle,
        tags,
        originType: "pages",
        originFile,
      });
    }
  }

  const seen = new Set();
  const notes = allNotes
    .filter((note) => {
      const signature = buildSignature(note);

      if (seen.has(signature)) {
        return false;
      }

      seen.add(signature);
      return true;
    })
    .map((note) => {
      const signature = buildSignature(note);
      const flags = getReviewFlags(note);

      return {
        ...note,
        review: {
          isNew: !previousSignatures.has(signature),
          flags,
        },
      };
    })
    .sort((left, right) => left.text.localeCompare(right.text));

  const tagSet = new Set();
  const bookSet = new Set();

  for (const note of notes) {
    bookSet.add(note.originFile);

    for (const tag of note.tags) {
      tagSet.add(tag);
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceDirectories: [PAGES_DIRECTORY],
    tags: [...tagSet].sort(),
    stats: {
      totalNotes: notes.length,
      taggedNotes: notes.length,
      books: bookSet.size,
      suspiciousNotes: notes.filter((note) => note.review.flags.length > 0).length,
      newNotes: notes.filter((note) => note.review.isNew).length,
    },
    notes,
  };

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2) + "\n");

  console.log(
    `Built ${notes.length} book notes across ${payload.tags.length} tags into ${OUTPUT_FILE}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

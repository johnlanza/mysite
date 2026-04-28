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
const OUTPUT_FILE = path.join(ROOT, "src/data/quotes.json");
const MY_QUOTES_PATTERN = /#?\[\[My Quotes\]\]/i;
const MY_WORDS_PATTERN =
  /(?<![\p{L}\p{N}_])(?:#(?:\[\[(?:mw|mywords)\]\]|mw|mywords)\b|\[\[(?:mw|mywords)\]\])/iu;
const TAG_PATTERN = /(?:^|\s)#(?:\[\[([^\]]+)\]\]|([a-zA-Z0-9/_-]+))/g;
const QUOTE_BLOCK_PATTERN = /#\+BEGIN_QUOTE[\s\S]*?#\+END_QUOTE/g;
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

function collectTags(text) {
  const tags = new Set();

  for (const match of text.matchAll(TAG_PATTERN)) {
    const tag = (match[1] ?? match[2] ?? "").trim().toLowerCase();

    if (!tag || tag === "my quotes") {
      continue;
    }

    tags.add(tag);
  }

  for (const match of collectImplicitTagRefs(text)) {
    tags.add(match.normalized);
  }

  return [...tags].sort();
}

function collectPageRefs(text) {
  const refs = [];

  for (const match of text.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
    const ref = (match[2] ?? match[1] ?? "").trim();

    if (!ref || /^My Quotes$/i.test(ref)) {
      continue;
    }

    refs.push(ref);
  }

  return refs;
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
        ref,
        normalized,
      });
    }
  }

  return implicitRefs;
}

function collectLinkLabels(text) {
  const labels = [];

  for (const match of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    const label = cleanupInlineMarkup(match[1] ?? "").trim();

    if (!label) {
      continue;
    }

    labels.push(label);
  }

  return labels;
}

function findAllowedSourceRef(text) {
  for (const ref of collectPageRefs(text)) {
    const normalized = ref.toLowerCase();

    if (SOURCE_REF_ALLOWLIST.has(normalized)) {
      return normalized;
    }
  }

  return null;
}

function findPreferredLinkedSource(text) {
  const labels = collectLinkLabels(text);

  for (const label of labels) {
    if (/^five bullet friday$/i.test(label)) {
      return cleanupSource(label);
    }
  }

  for (let index = labels.length - 1; index >= 0; index -= 1) {
    const label = labels[index];

    if (label.split(/\s+/).length >= 2) {
      return cleanupSource(label);
    }
  }

  return null;
}

function stripTagsAndMarkers(value) {
  const split = splitMyWordsNote(value);
  let stripped = split.quoteLine
    .replace(MY_QUOTES_PATTERN, " ")
    .replace(TAG_PATTERN, " ")
    .replace(/#\+BEGIN_QUOTE|#\+END_QUOTE/g, " ")
    .replace(/\[\[[A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th),\s+\d{4}\]\]/g, " ")
    .replace(/^[\s>*-]+/, " ");

  for (const match of collectImplicitTagRefs(value)) {
    stripped = stripped.replace(match.raw, " ");
  }

  return cleanupInlineMarkup(
    stripped,
  ).trim();
}

function splitMyWordsNote(line) {
  const match = line.match(MY_WORDS_PATTERN);

  if (!match || match.index === undefined) {
    return {
      quoteLine: line,
      note: null,
    };
  }

  const markerStart = match.index;
  const before = line.slice(0, markerStart).replace(/[\s([{]+$/, " ");
  const after = line
    .slice(markerStart)
    .replace(
      /^(?:#(?:\[\[(?:mw|mywords)\]\]|mw|mywords)\b|\[\[(?:mw|mywords)\]\])/i,
      "",
    );
  const cleanedNote = stripTagsAndMarkers(after)
    .replace(/^[:\-–—]\s*/, "")
    .trim();

  return {
    quoteLine: before,
    note: cleanedNote || null,
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

function isMetaNoise(line) {
  return /^(yellow highlight|note:|source::|cover::|title::|author::|type::|summary::|collapsed::|##)/i.test(
    stripTagsAndMarkers(line),
  );
}

function isTagOnlyLine(line) {
  const withoutTags = stripTagsAndMarkers(line);
  return withoutTags === "";
}

function isLikelyAuthorLine(line) {
  const cleaned = stripTagsAndMarkers(line);
  const words = cleaned.split(/\s+/).filter(Boolean);

  if (!cleaned || cleaned.length > 70) {
    return false;
  }

  if (/^[\u200B-\u200D\u2060\uFEFF\s]*[—-]\s*[A-Z]/.test(cleaned)) {
    return true;
  }

  if (/[.?!:"]/g.test(cleaned)) {
    return false;
  }

  if (words.length > 8) {
    return false;
  }

  if (/^(?:[—-]\s*)?[A-Z][A-Za-z'’.-]+(?:\s+[a-z][A-Za-z'’.-]+)*(?:\s+[A-Z][A-Za-z'’.-]+)+(?:\s+from\s+.+)?$/.test(cleaned)) {
    return true;
  }

  if (/^[A-Z][A-Za-z'’ -]+(?:,\s*[A-Za-z][A-Za-z'’ -]+)?$/.test(cleaned)) {
    return true;
  }

  return false;
}

function isLikelySourceLine(line) {
  return /\bsource:/i.test(line) || /\bfrom\s+\[\[|\bfrom\s+[A-Z]/.test(line);
}

function isQuoteishLine(line) {
  const cleaned = stripTagsAndMarkers(line);
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;

  if (!cleaned || cleaned.length < 8 || cleaned.length > 650) {
    return false;
  }

  if (isMetaNoise(line) || isTagOnlyLine(line) || isLikelyAuthorLine(line)) {
    return false;
  }

  if (MY_QUOTES_PATTERN.test(line) && cleaned.length > 16) {
    return true;
  }

  return (
    /[“"”]/.test(line) ||
    /(?:\*\*|==|\^\^)/.test(line) ||
    /[.,;:?!]/.test(cleaned) ||
    wordCount >= 4
  );
}

function parseAuthorLine(line) {
  return stripTagsAndMarkers(line).replace(/^[—-]\s*/, "").trim() || null;
}

function extractInlineAuthor(text) {
  const match = text.match(/(?:[”"]|\.)[ \t]*[—-][ \t]*([^#\n[]+)/);
  return match ? cleanupInlineMarkup(match[1]).trim() : null;
}

function splitTrailingAuthor(text) {
  const cleaned = cleanupInlineMarkup(text);
  const match = cleaned.match(
    /^(.*?)(?:\s*[—-]\s*([A-Z][A-Za-z0-9.'’ -]+(?:,\s*[^.]+)?))$/,
  );

  if (!match) {
    return {
      text: cleaned,
      author: null,
    };
  }

  return {
    text: match[1].trim(),
    author: match[2].trim(),
  };
}

function extractTrailingAuthorFromLine(line) {
  const cleaned = stripTagsAndMarkers(line);
  const match = cleaned.match(/(?:^|.*?\s)[—-]\s*([A-Z][A-Za-z.'’ -]+)$/);
  return match ? match[1].trim() : null;
}

function extractQuotedText(text) {
  const quotedMatch = text.match(/[“"]([\s\S]+?)[”"]/);
  return quotedMatch ? cleanupInlineMarkup(quotedMatch[1]) : null;
}

function extractLeadingAuthorFromQuotedLine(line) {
  const match = line.match(/^(.*?)\s*[“"]/);

  if (!match) {
    return null;
  }

  const candidate = stripTagsAndMarkers(match[1])
    .replace(/^[—-]\s*/, "")
    .replace(/[,:;.\s]+$/, "")
    .trim();

  if (!candidate || candidate.split(/\s+/).length > 8) {
    return null;
  }

  if (!/[A-Za-z]/.test(candidate) || /^(note|source|yellow highlight)$/i.test(candidate)) {
    return null;
  }

  return candidate;
}

function extractInlineLinkedAuthor(line) {
  const quoteMatch = line.match(/[”"]\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);

  if (!quoteMatch) {
    return null;
  }

  const candidate = cleanupAuthor(quoteMatch[2] ?? quoteMatch[1] ?? "");

  if (!candidate) {
    return null;
  }

  if (!/^[A-Za-z.'’ -]+(?:\s+[A-Za-z.'’ -]+)+$/.test(candidate)) {
    return null;
  }

  return candidate
    .split(/\s+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function extractAttributionDetails(line) {
  const cleaned = stripTagsAndMarkers(line);
  const match = cleaned.match(/^[\u200B-\u200D\u2060\uFEFF\s]*[—―-]\s*(.+?)$/);

  if (!match) {
    return {
      author: null,
      source: null,
    };
  }

  const cleanedTail = cleanupInlineMarkup(match[1]).trim();
  const fromMatch = cleanedTail.match(/^(.+?)\s+\bfrom\b\s+(.+)$/i);
  const author = cleanupInlineMarkup(fromMatch?.[1] ?? cleanedTail)
    .replace(/^[-—―]\s*/, "")
    .trim() || null;
  const trailing = cleanupInlineMarkup(fromMatch?.[2] ?? "").trim();
  let source = null;

  if (findPreferredLinkedSource(line)) {
    source = findPreferredLinkedSource(line);
  } else if (findAllowedSourceRef(line)) {
    source = findAllowedSourceRef(line);
  } else if (trailing) {
    source = trailing
      .replace(/^from\s+/i, "")
      .replace(/^his novel\s+/i, "")
      .trim() || null;
  }

  return {
    author,
    source,
  };
}

function extractPulledFromSource(text) {
  const cleaned = stripTagsAndMarkers(text);
  const match = cleaned.match(/\bPulled from\s+(.+)$/i);

  if (!match) {
    return null;
  }

  return cleanupSource(match[1]);
}

function extractBookStyleSourceDetails(value) {
  const cleaned = cleanupSource(value);

  if (!cleaned) {
    return {
      author: null,
      source: null,
    };
  }

  const match = cleaned.match(/^(.+?),\s*([^,(]+)(?:\s*\(([^)]+)\))?$/);

  if (!match) {
    return {
      author: null,
      source: cleaned,
    };
  }

  const source = cleanupSource(match[1]);
  const author = cleanupAuthor(match[2]);

  return {
    author,
    source,
  };
}

function cleanupAuthor(value) {
  if (!value) {
    return null;
  }

  let author = cleanupInlineMarkup(value)
    .replace(/^\s*\[+\s*/, "")
    .replace(/\s*\]+\s*$/, "")
    .replace(/\s*\bfrom\b\s*$/i, "")
    .replace(/\s*\bsaid\b\s*$/i, "")
    .replace(/\s*\bonce said that\b\s*$/i, "")
    .replace(/\s*\bon aging well\b\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (/^[A-Z0-9 .’'-]+,\s+/.test(author)) {
    author = author.split(",")[0]?.trim() ?? author;
  }

  author = author.replace(/[,\s]+$/, "");

  return author || null;
}

function extractSourceFromAuthor(author) {
  if (!author) {
    return {
      author: null,
      source: null,
    };
  }

  const fromMatch = author.match(/^(.*?)(?:,\s*|\s+\bfrom\b\s+)(.+)$/i);

  if (!fromMatch) {
    return {
      author,
      source: null,
    };
  }

  const nextAuthor = cleanupAuthor(fromMatch[1]);
  const nextSource = cleanupSource(fromMatch[2]);

  if (!nextAuthor || !nextSource) {
    return {
      author,
      source: null,
    };
  }

  if (
    /(newsletter|novel|book|podcast|app|wonderland|revolutionists|alaska|neighborhood)/i.test(
      nextSource,
    )
  ) {
    return {
      author: nextAuthor,
      source: nextSource,
    };
  }

  return {
    author,
    source: null,
  };
}

function cleanupSource(value) {
  if (!value) {
    return null;
  }

  return cleanupInlineMarkup(value)
    .replace(/^from\s+/i, "")
    .replace(/^via\s+/i, "")
    .replace(/newsletter$/i, "")
    .replace(/app$/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[,\s]+$/, "")
    .trim() || null;
}

function stripLeadingPreface(text) {
  return cleanupInlineMarkup(text)
    .replace(/^(love this|quote|old [^:]+ quote|pulled from|from)\s*:\s*/i, "")
    .trim();
}

function normalizeQuoteText(text) {
  let normalized = stripLeadingPreface(text)
    .replace(/^[—-]\s*/, "")
    .replace(/\s*[—-]\s*[A-Z][A-Za-z.'’ -]+(?:,\s*[^.]+)?$/, "")
    .replace(/[. ]+$/, "")
    .trim();

  normalized = normalized
    .replace(/^["“”]+/, "")
    .replace(/["“”]+$/, "")
    .trim();

  return normalized;
}

function isValidQuoteText(text, author) {
  const normalized = normalizeQuoteText(text);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  if (!normalized || normalized.length < 8 || normalized.length > 650) {
    return false;
  }

  if (wordCount < 3) {
    return false;
  }

  if (/^(what i did|absorbing)$/i.test(normalized)) {
    return false;
  }

  if (/yellow highlight|collapsed::|my quotes/i.test(normalized)) {
    return false;
  }

  if (/^(i added .*randomizer above|weekly wisdom: looking through)$/i.test(normalized)) {
    return false;
  }

  if (author && normalized.toLowerCase() === author.toLowerCase()) {
    return false;
  }

  return true;
}

function deriveAuthorFromPageTitle(sourcePageTitle) {
  if (!sourcePageTitle.includes(" | ")) {
    return null;
  }

  const parts = sourcePageTitle.split(" | ").map((part) => part.trim());
  return parts.at(-1) ?? null;
}

function deriveSourceDisplay(entry) {
  if (entry.originType === "journals") {
    return entry.source ?? entry.sourcePageTitle;
  }

  if (entry.source && entry.sourcePageTitle && entry.source !== entry.sourcePageTitle) {
    return entry.source;
  }

  return entry.source ?? entry.sourcePageTitle;
}

function buildId(originType, originFile, index) {
  return `${originType}:${originFile}:${index}`;
}

function createQuoteEntry({ quoteText, author, source, tags, note, meta, index }) {
  if (!quoteText) {
    return null;
  }

  const split = splitTrailingAuthor(quoteText);
  const normalizedText = normalizeQuoteText(split.text);
  const initialAuthor = author
    ? cleanupAuthor(author)
    : split.author
      ? cleanupAuthor(split.author)
      : null;
  const authorSourceSplit = extractSourceFromAuthor(initialAuthor);
  const normalizedAuthor = authorSourceSplit.author;
  let normalizedSource = cleanupSource(source) ?? authorSourceSplit.source;

  if (
    normalizedSource &&
    (normalizedSource.length > 120 ||
      normalizedSource.toLowerCase().includes(normalizedText.toLowerCase().slice(0, 30)))
  ) {
    normalizedSource = null;
  }

  if (!isValidQuoteText(normalizedText, normalizedAuthor)) {
    return null;
  }

  return {
    id: buildId(meta.originType, meta.originFile, index),
    text: normalizedText,
    author: normalizedAuthor,
    source: normalizedSource,
    sourcePageTitle: meta.sourcePageTitle,
    sourceDisplay: deriveSourceDisplay({
      source: normalizedSource,
      sourcePageTitle: meta.sourcePageTitle,
      originType: meta.originType,
    }),
    note: cleanupInlineMarkup(note ?? "").trim() || null,
    tags,
    originType: meta.originType,
    originFile: meta.originFile,
  };
}

function extractQuoteBlockEntry(block, meta, index) {
  if (!MY_QUOTES_PATTERN.test(block)) {
    return null;
  }

  const innerLines = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/#\+BEGIN_QUOTE|#\+END_QUOTE/.test(line));
  const tags = collectTags(block);
  const notes = [];

  let author = null;
  let source = findPreferredLinkedSource(block) ?? findAllowedSourceRef(block);
  const quoteLines = [];
  let encounteredSource = false;
  let insideQuotedPassage = false;

  for (const line of innerLines) {
    if (isTagOnlyLine(line)) {
      continue;
    }

    const noteSplit = splitMyWordsNote(line);
    if (noteSplit.note) {
      notes.push(noteSplit.note);
    }

    const contentLine = stripTagsAndMarkers(noteSplit.quoteLine);

    if (!contentLine) {
      continue;
    }

    const quoteMarkCount = (contentLine.match(/[“”"]/g) ?? []).length;

    if (!encounteredSource && (insideQuotedPassage || quoteMarkCount > 0)) {
      quoteLines.push(contentLine);

      if (quoteMarkCount % 2 === 1) {
        insideQuotedPassage = !insideQuotedPassage;
      }

      continue;
    }

    if (!encounteredSource && !author && /^[\u200B-\u200D\u2060\uFEFF\s]*[-—―]\s*[A-Z]/.test(line)) {
      author = parseAuthorLine(line);
      continue;
    }

    if (isLikelySourceLine(line)) {
      const sourceText = cleanupSource(contentLine.replace(/\bsource:/i, ""));
      const sourceDetails = extractBookStyleSourceDetails(sourceText);
      source = sourceDetails.source ?? sourceText;
      author ??= sourceDetails.author;
      encounteredSource = true;
      continue;
    }

    if (
      !encounteredSource &&
      !author &&
      isLikelyAuthorLine(line)
    ) {
      author = parseAuthorLine(line);
      continue;
    }

    if (
      !encounteredSource &&
      !author &&
      /once said that/i.test(contentLine) &&
      /[“"]/.test(contentLine)
    ) {
      author = cleanupAuthor(contentLine.replace(/[“"].*$/, ""));
    }

    if (!encounteredSource && contentLine) {
      quoteLines.push(contentLine);
    }
  }

  const quoteText = quoteLines.join(" ") || extractQuotedText(block);

  author ??=
    cleanupAuthor(extractInlineAuthor(block)) ??
    deriveAuthorFromPageTitle(meta.sourcePageTitle);

  return createQuoteEntry({
    quoteText,
    author,
    source,
    tags,
    note: combineNotes(notes),
    meta,
    index,
  });
}

function findPreviousNonEmptyLine(lines, start) {
  for (let index = start; index >= 0; index -= 1) {
    if (lines[index].trim()) {
      return lines[index];
    }
  }

  return null;
}

function findNextNonEmptyLine(lines, start) {
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index].trim()) {
      return lines[index];
    }
  }

  return null;
}

function extractLineEntry(lines, currentIndex, meta, index) {
  const current = lines[currentIndex];
  const previous = findPreviousNonEmptyLine(lines, currentIndex - 1);
  const next = findNextNonEmptyLine(lines, currentIndex + 1);
  const nextTwo = findNextNonEmptyLine(lines, currentIndex + 2);
  const context = [];

  if (previous && isQuoteishLine(previous)) {
    context.push(previous);
  }

  context.push(current);

  if (next && (isLikelyAuthorLine(next) || isLikelySourceLine(next) || isTagOnlyLine(next))) {
    context.push(next);
  }

  if (
    nextTwo &&
    nextTwo !== next &&
    (isLikelyAuthorLine(nextTwo) || isLikelySourceLine(nextTwo) || isTagOnlyLine(nextTwo))
  ) {
    context.push(nextTwo);
  }

  const rawText = context.join("\n");
  const tags = collectTags(rawText);
  const currentNoteSplit = splitMyWordsNote(current);
  const previousNoteSplit = previous
    ? splitMyWordsNote(previous)
    : { quoteLine: "", note: null };
  const nextNoteSplit = next ? splitMyWordsNote(next) : { quoteLine: "", note: null };
  const nextTwoNoteSplit = nextTwo
    ? splitMyWordsNote(nextTwo)
    : { quoteLine: "", note: null };
  const note = combineNotes([
    previousNoteSplit.note,
    currentNoteSplit.note,
    nextNoteSplit.note,
    nextTwoNoteSplit.note,
  ]);
  const currentText = stripTagsAndMarkers(currentNoteSplit.quoteLine);
  const previousText = previous ? stripTagsAndMarkers(previousNoteSplit.quoteLine) : "";
  const trailingAuthorFromCurrent = extractTrailingAuthorFromLine(current);
  const leadingAuthorFromCurrent = extractLeadingAuthorFromQuotedLine(current);
  const inlineLinkedAuthorFromCurrent = extractInlineLinkedAuthor(current);
  const attributionDetailsFromCurrent = extractAttributionDetails(current);
  const sourceRefFromRawText = findAllowedSourceRef(rawText);
  const preferredLinkedSource = findPreferredLinkedSource(rawText);
  const pulledFromSource = extractPulledFromSource(rawText);
  const currentLooksLikeAttributionLine =
    /^[\u200B-\u200D\u2060\uFEFF\s-]*[—―]/.test(current) ||
    attributionDetailsFromCurrent.author !== null;
  const quotedPreviousText = previous ? extractQuotedText(previous) : null;
  const currentQuotedTextCandidate = extractQuotedText(current);
  const currentQuotedText =
    currentQuotedTextCandidate &&
    currentQuotedTextCandidate.length < currentText.length * 0.6 &&
    /[—-][A-Z]/.test(currentText)
      ? currentText
      : currentQuotedTextCandidate;

  if (!currentQuotedText && quotedPreviousText && currentLooksLikeAttributionLine) {
    return createQuoteEntry({
      quoteText: quotedPreviousText,
      author: attributionDetailsFromCurrent.author ?? trailingAuthorFromCurrent,
      source:
        attributionDetailsFromCurrent.source ??
        preferredLinkedSource ??
        pulledFromSource ??
        sourceRefFromRawText,
      tags,
      note,
      meta,
      index,
    });
  }

  let quoteText = currentQuotedText ?? null;

  if (
    !quoteText &&
    previous &&
    currentLooksLikeAttributionLine &&
    quotedPreviousText
  ) {
    quoteText = quotedPreviousText;
  }

  if (!quoteText && isQuoteishLine(current)) {
    quoteText = currentText;
  }

  if (!quoteText && previous && isQuoteishLine(previous)) {
    quoteText = extractQuotedText(previous) ?? previousText;
  }

  const author =
    cleanupAuthor(trailingAuthorFromCurrent) ??
    cleanupAuthor(leadingAuthorFromCurrent) ??
    cleanupAuthor(inlineLinkedAuthorFromCurrent) ??
    cleanupAuthor(attributionDetailsFromCurrent.author) ??
    cleanupAuthor(extractInlineAuthor(current)) ??
    (next && isLikelyAuthorLine(next) ? parseAuthorLine(next) : null) ??
    (nextTwo && isLikelyAuthorLine(nextTwo) ? parseAuthorLine(nextTwo) : null) ??
    deriveAuthorFromPageTitle(meta.sourcePageTitle);
  const source =
    cleanupSource(attributionDetailsFromCurrent.source) ??
    preferredLinkedSource ??
    pulledFromSource ??
    (inlineLinkedAuthorFromCurrent ? null : sourceRefFromRawText) ??
    (next && isLikelySourceLine(next)
      ? cleanupSource(stripTagsAndMarkers(next.replace(/\bsource:/i, "")))
      : null) ??
    (nextTwo && isLikelySourceLine(nextTwo)
      ? cleanupSource(stripTagsAndMarkers(nextTwo.replace(/\bsource:/i, "")))
      : null);

  return createQuoteEntry({
    quoteText,
    author,
    source,
    tags,
    note,
    meta,
    index,
  });
}

async function getMarkdownFiles(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });

  return dirents
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(dir, entry.name));
}

function dedupeQuotes(quotes) {
  const seen = new Set();

  return quotes.filter((quote) => {
    const key = `${quote.text.toLowerCase()}|${(quote.author ?? "").toLowerCase()}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildQuoteSignature(quote) {
  return [
    quote.originFile,
    quote.text.toLowerCase(),
    (quote.author ?? "").toLowerCase(),
    (quote.source ?? "").toLowerCase(),
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

function getSuspiciousFlags(quote) {
  const flags = [];
  const normalizedText = quote.text.toLowerCase();
  const normalizedAuthor = (quote.author ?? "").toLowerCase();
  const normalizedSource = (quote.source ?? "").toLowerCase();

  if (!quote.author) {
    flags.push("missing-author");
  }

  if (!quote.source && quote.originType === "journals") {
    flags.push("journal-date-fallback");
  }

  if (normalizedAuthor.includes("from ") || normalizedAuthor.includes(" said")) {
    flags.push("author-needs-cleanup");
  }

  if (normalizedSource.length > 100) {
    flags.push("source-too-long");
  }

  if (/pulled from|newsletter/.test(normalizedText)) {
    flags.push("quote-text-needs-cleanup");
  }

  if (quote.text.includes("—") && !quote.author) {
    flags.push("inline-attribution-left-in-quote");
  }

  return flags;
}

async function main() {
  const allQuotes = [];
  const previousDataset = await readPreviousDataset();
  const previousSignatures = new Set(
    (previousDataset?.quotes ?? []).map((quote) => buildQuoteSignature(quote)),
  );

  for (const source of SOURCE_DIRECTORIES) {
    const files = await getMarkdownFiles(source.dir);

    for (const filePath of files) {
      const content = await fs.readFile(filePath, "utf8");
      const originFile = path.basename(filePath);
      const meta = {
        originType: source.type,
        originFile,
        sourcePageTitle: decodeFileName(originFile),
      };

      let nextIndex = 0;

      for (const match of content.matchAll(QUOTE_BLOCK_PATTERN)) {
        const entry = extractQuoteBlockEntry(match[0], meta, nextIndex++);

        if (entry) {
          allQuotes.push(entry);
        }
      }

      const contentWithoutBlocks = content.replace(QUOTE_BLOCK_PATTERN, "");
      const lines = contentWithoutBlocks.split("\n");

      for (let index = 0; index < lines.length; index += 1) {
        if (!MY_QUOTES_PATTERN.test(lines[index])) {
          continue;
        }

        const entry = extractLineEntry(lines, index, meta, nextIndex++);

        if (entry) {
          allQuotes.push(entry);
        }
      }
    }
  }

  const quotes = dedupeQuotes(allQuotes)
    .map((quote) => {
      const signature = buildQuoteSignature(quote);
      const flags = getSuspiciousFlags(quote);

      return {
        ...quote,
        review: {
          isNew: !previousSignatures.has(signature),
          flags,
        },
      };
    })
    .sort((left, right) => left.text.localeCompare(right.text));
  const tagSet = new Set();

  for (const quote of quotes) {
    for (const tag of quote.tags) {
      tagSet.add(tag);
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceDirectories: SOURCE_DIRECTORIES.map((entry) => entry.dir),
    tags: [...tagSet].sort(),
    stats: {
      totalQuotes: quotes.length,
      taggedQuotes: quotes.filter((quote) => quote.tags.length > 0).length,
      suspiciousQuotes: quotes.filter((quote) => quote.review.flags.length > 0).length,
      newQuotes: quotes.filter((quote) => quote.review.isNew).length,
    },
    quotes,
  };

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2) + "\n");

  console.log(
    `Built ${quotes.length} quotes across ${payload.tags.length} tags into ${OUTPUT_FILE}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

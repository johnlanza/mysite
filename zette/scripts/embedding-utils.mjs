import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
export const QUOTES_FILE = path.join(ROOT, "src/data/quotes.json");
export const BOOK_NOTES_FILE = path.join(ROOT, "src/data/book-notes.json");
export const QUESTIONS_FILE = path.join(ROOT, "src/data/questions.json");
export const BRAIN_FILE = path.join(ROOT, "src/data/brain.json");
export const EMBEDDINGS_FILE = path.join(ROOT, "src/data/embeddings.json");

export const MODEL = "text-embedding-3-small";
export const DIMENSIONS = 512;
export const ESTIMATED_EMBEDDING_PRICE_PER_MILLION_TOKENS_USD = 0.02;

export function hashText(text) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);
}

export function buildEmbeddingInput(piece) {
  // Keep embeddings focused on the idea itself; source metadata is handled
  // separately during Echoes ranking so one book does not dominate matches.
  const parts = [piece.text];
  if (piece.note) parts.push(`my note: ${piece.note}`);
  if (piece.tags && piece.tags.length > 0) {
    parts.push(`tags: ${piece.tags.join(", ")}`);
  }
  return parts.join("\n");
}

function getSourceLabel(value, fallback) {
  let label = value?.trim() || fallback;

  if (label.includes(" | ")) {
    label = label.split(" | ")[0]?.trim() || label;
  }

  if (label.length > 54 && label.includes(": ")) {
    label = label.split(": ")[0]?.trim() || label;
  }

  return label;
}

function unifyQuote(q) {
  return {
    id: `q:${q.id}`,
    kind: "quote",
    text: q.text,
    note: q.note,
    tags: q.tags ?? [],
    sourceLabel: getSourceLabel(
      q.sourceDisplay || q.source || q.author,
      "Quotes",
    ),
  };
}

function unifyNote(n) {
  return {
    id: `n:${n.id}`,
    kind: "note",
    text: n.text,
    note: n.note,
    tags: n.tags ?? [],
    sourceLabel: getSourceLabel(n.bookTitle || n.sourceDisplay, "Notes"),
  };
}

function unifyQuestion(q) {
  return {
    id: `question:${q.id}`,
    kind: "question",
    text: q.text,
    note: null,
    tags: q.tags ?? [],
    sourceLabel: getSourceLabel(q.sourceDisplay, "Questions"),
  };
}

function unifyBrainRecord(record) {
  return {
    id: `brain:${record.id}`,
    kind: "brain",
    text: record.text,
    note: record.note,
    tags: record.tags ?? [],
    sourceLabel: getSourceLabel(
      record.sourceTitle || record.sourceDisplay || record.originFile,
      "Brain",
    ),
  };
}

export async function readJson(filePath, fallback = null) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (err) {
    if (err.code === "ENOENT" && fallback !== null) return fallback;
    throw err;
  }
}

export async function readEmbeddingDatasets() {
  const [quotesDataset, notesDataset, questionsDataset, brainDataset] =
    await Promise.all([
      readJson(QUOTES_FILE),
      readJson(BOOK_NOTES_FILE),
      readJson(QUESTIONS_FILE),
      readJson(BRAIN_FILE),
    ]);

  return { quotesDataset, notesDataset, questionsDataset, brainDataset };
}

export function buildEmbeddingPieces({
  quotesDataset,
  notesDataset,
  questionsDataset,
  brainDataset,
}) {
  const curatedRecordIds = new Set([
    ...quotesDataset.quotes.map((quote) => quote.id),
    ...notesDataset.notes.map((note) => note.id),
    ...questionsDataset.questions.map((question) => question.id),
  ]);

  return [
    ...quotesDataset.quotes.map(unifyQuote),
    ...notesDataset.notes.map(unifyNote),
    ...questionsDataset.questions.map(unifyQuestion),
    ...brainDataset.records
      .filter(
        (record) =>
          record.search?.semanticEligible && !curatedRecordIds.has(record.id),
      )
      .map(unifyBrainRecord),
  ];
}

export async function readExistingEmbeddings() {
  return readJson(EMBEDDINGS_FILE, {
    model: MODEL,
    dimensions: DIMENSIONS,
    generatedAt: null,
    entries: {},
  });
}

export async function getEmbeddingPlan() {
  const datasets = await readEmbeddingDatasets();
  const pieces = buildEmbeddingPieces(datasets);
  const existing = await readExistingEmbeddings();
  const modelChanged =
    existing.model !== MODEL || existing.dimensions !== DIMENSIONS;
  const entries = modelChanged ? {} : { ...existing.entries };
  const toEmbed = [];

  for (const piece of pieces) {
    const input = buildEmbeddingInput(piece);
    const textHash = hashText(input);
    const prior = entries[piece.id];

    if (prior && prior.textHash === textHash) continue;
    toEmbed.push({ id: piece.id, kind: piece.kind, input, textHash });
  }

  const validIds = new Set(pieces.map((piece) => piece.id));
  const removedIds = [];

  for (const id of Object.keys(entries)) {
    if (!validIds.has(id)) {
      removedIds.push(id);
      delete entries[id];
    }
  }

  return {
    datasets,
    pieces,
    existing,
    entries,
    toEmbed,
    validIds,
    removedIds,
    modelChanged,
  };
}

function emptyKindSummary() {
  return {
    quote: { totalPieces: 0, pendingPieces: 0, pendingCharacters: 0 },
    note: { totalPieces: 0, pendingPieces: 0, pendingCharacters: 0 },
    question: { totalPieces: 0, pendingPieces: 0, pendingCharacters: 0 },
    brain: { totalPieces: 0, pendingPieces: 0, pendingCharacters: 0 },
  };
}

export function summarizeEmbeddingPlan(plan) {
  const byKind = emptyKindSummary();
  let totalInputCharacters = 0;
  let pendingCharacters = 0;
  const pendingIds = new Set(plan.toEmbed.map((piece) => piece.id));
  const pendingSources = new Map();

  for (const piece of plan.pieces) {
    const input = buildEmbeddingInput(piece);
    byKind[piece.kind].totalPieces += 1;
    totalInputCharacters += input.length;

    if (!pendingIds.has(piece.id)) continue;

    byKind[piece.kind].pendingPieces += 1;
    byKind[piece.kind].pendingCharacters += input.length;
    pendingCharacters += input.length;
    pendingSources.set(
      piece.sourceLabel,
      (pendingSources.get(piece.sourceLabel) ?? 0) + 1,
    );
  }

  const estimatedPendingTokens = Math.ceil(pendingCharacters / 4);

  return {
    model: MODEL,
    dimensions: DIMENSIONS,
    generatedAt: plan.existing.generatedAt ?? null,
    isCurrent:
      plan.toEmbed.length === 0 &&
      plan.removedIds.length === 0 &&
      !plan.modelChanged,
    totalPieces: plan.pieces.length,
    cachedPieces: plan.pieces.length - plan.toEmbed.length,
    pendingPieces: plan.toEmbed.length,
    removedPieces: plan.removedIds.length,
    totalInputCharacters,
    pendingCharacters,
    estimatedPendingTokens,
    estimatedPendingCostUsd:
      (estimatedPendingTokens / 1_000_000) *
      ESTIMATED_EMBEDDING_PRICE_PER_MILLION_TOKENS_USD,
    staleDueToModelChange: plan.modelChanged,
    topPendingSources: [...pendingSources.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.label.localeCompare(right.label),
      )
      .slice(0, 3),
    byKind,
  };
}

export function formatEstimatedCost(value) {
  if (!value || value <= 0) return "$0.00";
  if (value < 0.01) return "<$0.01";

  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

import crypto from "node:crypto";

import type { BookNotesDataset } from "./book-notes-data";
import type { BrainDataset } from "./brain-data";
import type { EmbeddingsFile } from "./embeddings";
import type { QuestionsDataset } from "./questions-data";
import type { QuotesDataset } from "./quotes-data";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 512;
const ESTIMATED_EMBEDDING_PRICE_PER_MILLION_TOKENS_USD = 0.02;

type EmbeddingPieceKind = "quote" | "note" | "question" | "brain";

type EmbeddingPiece = {
  id: string;
  kind: EmbeddingPieceKind;
  text: string;
  note: string | null;
  tags: string[];
  sourceLabel: string;
};

type KindFreshness = {
  totalPieces: number;
  pendingPieces: number;
  pendingCharacters: number;
};

export type EmbeddingFreshness = {
  model: string;
  dimensions: number;
  generatedAt: string | null;
  isCurrent: boolean;
  totalPieces: number;
  embeddedPieces: number;
  pendingPieces: number;
  removedPieces: number;
  totalInputCharacters: number;
  pendingCharacters: number;
  estimatedPendingTokens: number;
  estimatedPendingCostUsd: number;
  staleDueToModelChange: boolean;
  topPendingSources: Array<{ label: string; count: number }>;
  byKind: Record<EmbeddingPieceKind, KindFreshness>;
};

function hashText(text: string): string {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);
}

function buildEmbeddingInput(piece: EmbeddingPiece): string {
  const parts = [piece.text];

  if (piece.note) parts.push(`my note: ${piece.note}`);
  if (piece.tags.length > 0) parts.push(`tags: ${piece.tags.join(", ")}`);

  return parts.join("\n");
}

function estimateTokens(characters: number): number {
  return Math.ceil(characters / 4);
}

function getSourceLabel(value: string | null | undefined, fallback: string): string {
  let label = value?.trim() || fallback;

  if (label.includes(" | ")) {
    label = label.split(" | ")[0]?.trim() || label;
  }

  if (label.length > 54 && label.includes(": ")) {
    label = label.split(": ")[0]?.trim() || label;
  }

  return label;
}

function buildPieces(
  quotesDataset: QuotesDataset,
  notesDataset: BookNotesDataset,
  questionsDataset: QuestionsDataset,
  brainDataset: BrainDataset,
): EmbeddingPiece[] {
  const curatedRecordIds = new Set([
    ...quotesDataset.quotes.map((quote) => quote.id),
    ...notesDataset.notes.map((note) => note.id),
    ...questionsDataset.questions.map((question) => question.id),
  ]);

  return [
    ...quotesDataset.quotes.map((quote) => ({
      id: `q:${quote.id}`,
      kind: "quote" as const,
      text: quote.text,
      note: quote.note,
      tags: quote.tags ?? [],
      sourceLabel: getSourceLabel(
        quote.sourceDisplay || quote.source || quote.author,
        "Quotes",
      ),
    })),
    ...notesDataset.notes.map((note) => ({
      id: `n:${note.id}`,
      kind: "note" as const,
      text: note.text,
      note: note.note,
      tags: note.tags ?? [],
      sourceLabel: getSourceLabel(note.bookTitle || note.sourceDisplay, "Notes"),
    })),
    ...questionsDataset.questions.map((question) => ({
      id: `question:${question.id}`,
      kind: "question" as const,
      text: question.text,
      note: null,
      tags: question.tags ?? [],
      sourceLabel: getSourceLabel(question.sourceDisplay, "Questions"),
    })),
    ...brainDataset.records
      .filter(
        (record) =>
          record.search.semanticEligible && !curatedRecordIds.has(record.id),
      )
      .map((record) => ({
        id: `brain:${record.id}`,
        kind: "brain" as const,
        text: record.text,
        note: record.note,
        tags: record.tags ?? [],
        sourceLabel: getSourceLabel(
          record.sourceTitle || record.sourceDisplay || record.originFile,
          "Brain",
        ),
      })),
  ];
}

function emptyKindFreshness(): Record<EmbeddingPieceKind, KindFreshness> {
  return {
    quote: { totalPieces: 0, pendingPieces: 0, pendingCharacters: 0 },
    note: { totalPieces: 0, pendingPieces: 0, pendingCharacters: 0 },
    question: { totalPieces: 0, pendingPieces: 0, pendingCharacters: 0 },
    brain: { totalPieces: 0, pendingPieces: 0, pendingCharacters: 0 },
  };
}

export function getEmbeddingFreshness({
  quotesDataset,
  notesDataset,
  questionsDataset,
  brainDataset,
  embeddings,
}: {
  quotesDataset: QuotesDataset;
  notesDataset: BookNotesDataset;
  questionsDataset: QuestionsDataset;
  brainDataset: BrainDataset;
  embeddings: EmbeddingsFile | null;
}): EmbeddingFreshness {
  const pieces = buildPieces(
    quotesDataset,
    notesDataset,
    questionsDataset,
    brainDataset,
  );
  const existingEntries = embeddings?.entries ?? {};
  const modelMatches =
    embeddings?.model === EMBEDDING_MODEL &&
    embeddings?.dimensions === EMBEDDING_DIMENSIONS;
  const comparableEntries = modelMatches ? existingEntries : {};
  const validIds = new Set(pieces.map((piece) => piece.id));
  const byKind = emptyKindFreshness();
  let totalInputCharacters = 0;
  let pendingCharacters = 0;
  let embeddedPieces = 0;
  let pendingPieces = 0;
  const pendingSources = new Map<string, number>();

  for (const piece of pieces) {
    const input = buildEmbeddingInput(piece);
    const textHash = hashText(input);
    const prior = comparableEntries[piece.id];
    const inputCharacters = input.length;

    totalInputCharacters += inputCharacters;
    byKind[piece.kind].totalPieces += 1;

    if (prior && prior.textHash === textHash) {
      embeddedPieces += 1;
      continue;
    }

    pendingPieces += 1;
    pendingCharacters += inputCharacters;
    byKind[piece.kind].pendingPieces += 1;
    byKind[piece.kind].pendingCharacters += inputCharacters;
    pendingSources.set(
      piece.sourceLabel,
      (pendingSources.get(piece.sourceLabel) ?? 0) + 1,
    );
  }

  const removedPieces = modelMatches
    ? Object.keys(existingEntries).filter((id) => !validIds.has(id)).length
    : Object.keys(existingEntries).length;
  const estimatedPendingTokens = estimateTokens(pendingCharacters);

  return {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    generatedAt: embeddings?.generatedAt ?? null,
    isCurrent:
      pendingPieces === 0 &&
      removedPieces === 0 &&
      Boolean(embeddings) &&
      modelMatches,
    totalPieces: pieces.length,
    embeddedPieces,
    pendingPieces,
    removedPieces,
    totalInputCharacters,
    pendingCharacters,
    estimatedPendingTokens,
    estimatedPendingCostUsd:
      (estimatedPendingTokens / 1_000_000) *
      ESTIMATED_EMBEDDING_PRICE_PER_MILLION_TOKENS_USD,
    staleDueToModelChange: Boolean(embeddings && !modelMatches),
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

import {
  readBookNotesDataset,
  type BookNoteRecord,
} from "./book-notes-data";
import { readQuotesDataset, type QuoteRecord } from "./quotes-data";

export type PieceKind = "quote" | "note";

export type Piece = {
  id: string;
  kind: PieceKind;
  text: string;
  attribution: string | null;
  context: string | null;
  sourceDisplay: string;
  tags: string[];
  originType: string;
  originFile: string;
};

function quoteToPiece(q: QuoteRecord): Piece {
  return {
    id: `q:${q.id}`,
    kind: "quote",
    text: q.text,
    attribution: q.author,
    context: q.source,
    sourceDisplay: q.sourceDisplay,
    tags: q.tags,
    originType: q.originType,
    originFile: q.originFile,
  };
}

function noteToPiece(n: BookNoteRecord): Piece {
  return {
    id: `n:${n.id}`,
    kind: "note",
    text: n.text,
    attribution: n.bookAuthor || null,
    context: n.bookTitle || null,
    sourceDisplay: n.sourceDisplay,
    tags: n.tags,
    originType: n.originType,
    originFile: n.originFile,
  };
}

export async function readAllPieces(): Promise<Piece[]> {
  const [quotesDataset, bookNotesDataset] = await Promise.all([
    readQuotesDataset(),
    readBookNotesDataset(),
  ]);

  return [
    ...quotesDataset.quotes.map(quoteToPiece),
    ...bookNotesDataset.notes.map(noteToPiece),
  ];
}

export function findPieceById(pieces: Piece[], id: string): Piece | null {
  return pieces.find((p) => p.id === id) ?? null;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function pickDailySeed(pieces: Piece[], date: Date = new Date()): Piece {
  const dateKey = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  const eligible = pieces.filter((p) => p.text.length >= 40);
  const pool = eligible.length > 0 ? eligible : pieces;
  const index = hashString(dateKey) % pool.length;
  return pool[index];
}

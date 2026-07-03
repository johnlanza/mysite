import {
  readBookNotesDataset,
  type BookNoteRecord,
} from "./book-notes-data";
import {
  DEFAULT_DAILY_CARD_TIME_ZONE,
  getDailyCardDateKey,
} from "./daily-card";
import { readQuotesDataset, type QuoteRecord } from "./quotes-data";

export type PieceKind = "quote" | "note";

export type Piece = {
  id: string;
  kind: PieceKind;
  text: string;
  attribution: string | null;
  context: string | null;
  note: string | null;
  sourceDisplay: string;
  sourceLocator: string | null;
  blockId: string | null;
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
    note: q.note,
    sourceDisplay: q.sourceDisplay,
    sourceLocator: q.sourceLocator ?? null,
    blockId: q.blockId ?? null,
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
    note: n.note,
    sourceDisplay: n.sourceDisplay,
    sourceLocator: n.sourceLocator ?? null,
    blockId: n.blockId ?? null,
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

export function getDailyCardTimeZone(): string {
  const configured =
    process.env.ZETTE_DAILY_TIME_ZONE?.trim() || process.env.TZ?.trim();

  return configured || DEFAULT_DAILY_CARD_TIME_ZONE;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getDailySeedKey(
  date: Date = new Date(),
  timeZone: string = getDailyCardTimeZone(),
): string {
  return getDailyCardDateKey(date, timeZone);
}

export function pickDailySeedForDateKey(
  pieces: Piece[],
  dateKey: string,
): Piece {
  const eligible = pieces.filter((p) => p.text.length >= 40);
  const pool = eligible.length > 0 ? eligible : pieces;
  const index = hashString(dateKey) % pool.length;
  return pool[index];
}

export function pickDailySeed(pieces: Piece[], date: Date = new Date()): Piece {
  return pickDailySeedForDateKey(pieces, getDailySeedKey(date));
}

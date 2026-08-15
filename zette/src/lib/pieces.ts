import {
  readBookNotesDataset,
  type BookNoteRecord,
} from "./book-notes-data";
import { readBrainDataset, type BrainRecord } from "./brain-data";
import {
  DEFAULT_DAILY_CARD_TIME_ZONE,
  getDailyCardDateKey,
} from "./daily-card";
import { readQuestionsDataset, type QuestionRecord } from "./questions-data";
import { readQuotesDataset, type QuoteRecord } from "./quotes-data";

export type PieceKind = "quote" | "note" | "question" | "brain";

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
  featuredEligible: boolean;
  echoEligible: boolean;
  searchScore?: number;
  searchReasons?: string[];
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
    featuredEligible: true,
    echoEligible: true,
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
    featuredEligible: true,
    echoEligible: true,
  };
}

function questionToPiece(q: QuestionRecord): Piece {
  return {
    id: `question:${q.id}`,
    kind: "question",
    text: q.text,
    attribution: null,
    context: q.sourceDisplay,
    note: null,
    sourceDisplay: q.sourceDisplay,
    sourceLocator: q.sourceLocator ?? null,
    blockId: q.blockId ?? null,
    tags: q.tags,
    originType: q.originType,
    originFile: q.originFile,
    featuredEligible: false,
    echoEligible: true,
  };
}

function brainToPiece(record: BrainRecord): Piece {
  return {
    id: `brain:${record.id}`,
    kind: "brain",
    text: record.text,
    attribution: null,
    context: record.sourceDisplay,
    note: record.note,
    sourceDisplay: record.sourceDisplay,
    sourceLocator: record.sourceLocator ?? null,
    blockId: record.blockId ?? null,
    tags: record.tags,
    originType: record.originType,
    originFile: record.originFile,
    featuredEligible: false,
    echoEligible: record.search.semanticEligible,
    searchScore: record.search.score,
    searchReasons: record.search.reasons,
  };
}

export async function readFeaturedPieces(): Promise<Piece[]> {
  const [quotesDataset, bookNotesDataset] = await Promise.all([
    readQuotesDataset(),
    readBookNotesDataset(),
  ]);

  return [
    ...quotesDataset.quotes.map(quoteToPiece),
    ...bookNotesDataset.notes.map(noteToPiece),
  ];
}

export async function readSearchPieces(): Promise<Piece[]> {
  const [
    quotesDataset,
    bookNotesDataset,
    questionsDataset,
    brainDataset,
  ] = await Promise.all([
    readQuotesDataset(),
    readBookNotesDataset(),
    readQuestionsDataset(),
    readBrainDataset(),
  ]);

  return [
    ...quotesDataset.quotes.map(quoteToPiece),
    ...bookNotesDataset.notes.map(noteToPiece),
    ...questionsDataset.questions.map(questionToPiece),
    ...brainDataset.records.map(brainToPiece),
  ];
}

export async function readBrowsePieces(): Promise<Piece[]> {
  const [featured, questionsDataset] = await Promise.all([
    readFeaturedPieces(),
    readQuestionsDataset(),
  ]);

  return [
    ...featured,
    ...questionsDataset.questions.map(questionToPiece),
  ];
}

export async function readAllPieces(): Promise<Piece[]> {
  return readSearchPieces();
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
  const eligible = pieces.filter(
    (p) => p.featuredEligible && p.text.length >= 40,
  );
  const pool = eligible.length > 0 ? eligible : pieces;
  const index = hashString(dateKey) % pool.length;
  return pool[index];
}

export function pickDailySeed(pieces: Piece[], date: Date = new Date()): Piece {
  return pickDailySeedForDateKey(pieces, getDailySeedKey(date));
}

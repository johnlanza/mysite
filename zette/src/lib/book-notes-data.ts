import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.env.ZETTE_ROOT ?? process.cwd();

export const BOOK_NOTES_DATA_FILE = path.join(ROOT, "src/data/book-notes.json");

export type BookNoteRecord = {
  id: string;
  text: string;
  bookTitle: string;
  bookAuthor: string;
  sourcePageTitle: string;
  sourceDisplay: string;
  tags: string[];
  originType: string;
  originFile: string;
  review: {
    isNew: boolean;
    flags: string[];
  };
};

export type BookNotesDataset = {
  generatedAt: string;
  sourceDirectories: string[];
  tags: string[];
  stats: {
    totalNotes: number;
    taggedNotes: number;
    books: number;
    suspiciousNotes: number;
    newNotes: number;
  };
  notes: BookNoteRecord[];
};

export async function readBookNotesDataset(): Promise<BookNotesDataset> {
  const content = await fs.readFile(BOOK_NOTES_DATA_FILE, "utf8");
  return JSON.parse(content) as BookNotesDataset;
}

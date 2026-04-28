import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.env.ZETTE_ROOT ?? process.cwd();

export const QUOTES_DATA_FILE = path.join(ROOT, "src/data/quotes.json");

export type QuoteRecord = {
  id: string;
  text: string;
  author: string | null;
  source: string | null;
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

export type QuotesDataset = {
  generatedAt: string;
  sourceDirectories: string[];
  tags: string[];
  stats: {
    totalQuotes: number;
    taggedQuotes: number;
    suspiciousQuotes: number;
    newQuotes: number;
  };
  quotes: QuoteRecord[];
};

export async function readQuotesDataset(): Promise<QuotesDataset> {
  const content = await fs.readFile(QUOTES_DATA_FILE, "utf8");
  return JSON.parse(content) as QuotesDataset;
}

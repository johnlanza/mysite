import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.env.ZETTE_ROOT ?? process.cwd();

export const BRAIN_DATA_FILE = path.join(ROOT, "src/data/brain.json");

export type BrainRecord = {
  id: string;
  text: string;
  note: string | null;
  sourcePageTitle: string;
  sourceTitle?: string | null;
  sourceAttribution?: string | null;
  sourceDisplay: string;
  sourceLocator?: string | null;
  blockId?: string | null;
  tags: string[];
  refs: string[];
  originType: string;
  originFile: string;
  lineIndex: number;
  search: {
    score: number;
    reasons: string[];
    candidate: boolean;
    semanticEligible: boolean;
  };
  review: {
    isNew: boolean;
    flags: string[];
  };
};

export type BrainDataset = {
  generatedAt: string;
  sourceDirectories: string[];
  tags: string[];
  refs: string[];
  stats: {
    totalRecords: number;
    candidateRecords: number;
    semanticRecords: number;
    skippedSensitive: number;
    scannedFiles: number;
    newRecords: number;
  };
  records: BrainRecord[];
};

export async function readBrainDataset(): Promise<BrainDataset> {
  const content = await fs.readFile(BRAIN_DATA_FILE, "utf8");
  return JSON.parse(content) as BrainDataset;
}

export function getCandidateBrainRecords(dataset: BrainDataset): BrainRecord[] {
  return dataset.records
    .filter((record) => record.search.candidate)
    .sort((left, right) => {
      const scoreDiff = right.search.score - left.search.score;
      return scoreDiff || left.text.localeCompare(right.text);
    });
}

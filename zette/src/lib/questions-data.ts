import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.env.ZETTE_ROOT ?? process.cwd();

export const QUESTIONS_DATA_FILE = path.join(ROOT, "src/data/questions.json");

export type QuestionRecord = {
  id: string;
  text: string;
  sourceDisplay: string;
  sourcePageTitle: string;
  sourceLocator?: string | null;
  blockId?: string | null;
  tags: string[];
  originType: string;
  originFile: string;
  review: {
    isNew: boolean;
    flags: string[];
  };
};

export type QuestionsDataset = {
  generatedAt: string;
  sourceDirectories: string[];
  tags: string[];
  stats: {
    totalQuestions: number;
    taggedQuestions: number;
    newQuestions: number;
  };
  questions: QuestionRecord[];
};

export async function readQuestionsDataset(): Promise<QuestionsDataset> {
  const content = await fs.readFile(QUESTIONS_DATA_FILE, "utf8");
  return JSON.parse(content) as QuestionsDataset;
}

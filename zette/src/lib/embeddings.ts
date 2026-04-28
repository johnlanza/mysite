import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.env.ZETTE_ROOT ?? process.cwd();

export const EMBEDDINGS_DATA_FILE = path.join(ROOT, "src/data/embeddings.json");

export type EmbeddingsFile = {
  model: string;
  dimensions: number;
  generatedAt: string | null;
  entries: Record<string, { textHash: string; vector: number[] }>;
};

export type EmbeddingsIndex = {
  dimensions: number;
  byId: Map<string, number[]>;
};

let cache: { mtimeMs: number; index: EmbeddingsIndex } | null = null;

export async function readEmbeddings(): Promise<EmbeddingsIndex | null> {
  let mtimeMs: number;
  try {
    const stat = await fs.stat(EMBEDDINGS_DATA_FILE);
    mtimeMs = stat.mtimeMs;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }

  if (cache && cache.mtimeMs === mtimeMs) return cache.index;

  const content = await fs.readFile(EMBEDDINGS_DATA_FILE, "utf8");
  const file = JSON.parse(content) as EmbeddingsFile;
  const byId = new Map<string, number[]>();
  for (const [id, entry] of Object.entries(file.entries)) {
    byId.set(id, entry.vector);
  }
  const index = { dimensions: file.dimensions, byId };
  cache = { mtimeMs, index };
  return index;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

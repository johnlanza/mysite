import fs from "node:fs/promises";

import { readBookNotesDataset } from "@/lib/book-notes-data";
import { readBrainDataset } from "@/lib/brain-data";
import { EMBEDDINGS_DATA_FILE, type EmbeddingsFile } from "@/lib/embeddings";
import { readQuestionsDataset } from "@/lib/questions-data";
import { readQuotesDataset } from "@/lib/quotes-data";

export const dynamic = "force-dynamic";

function latestGeneratedAt(values: Array<string | null | undefined>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

async function readEmbeddingsFile(): Promise<EmbeddingsFile | null> {
  try {
    const content = await fs.readFile(EMBEDDINGS_DATA_FILE, "utf8");
    return JSON.parse(content) as EmbeddingsFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function GET() {
  const [quotes, bookNotes, questions, brain, embeddings] = await Promise.all([
    readQuotesDataset(),
    readBookNotesDataset(),
    readQuestionsDataset(),
    readBrainDataset(),
    readEmbeddingsFile(),
  ]);
  const generatedAt = latestGeneratedAt([
    quotes.generatedAt,
    bookNotes.generatedAt,
    questions.generatedAt,
    brain.generatedAt,
    embeddings?.generatedAt,
  ]);

  return Response.json({
    generatedAt,
    datasets: {
      quotes: {
        count: quotes.quotes.length,
        generatedAt: quotes.generatedAt,
      },
      bookNotes: {
        count: bookNotes.notes.length,
        generatedAt: bookNotes.generatedAt,
      },
      questions: {
        count: questions.questions.length,
        generatedAt: questions.generatedAt,
      },
      brain: {
        count: brain.records.length,
        generatedAt: brain.generatedAt,
      },
      embeddings: {
        count: Object.keys(embeddings?.entries ?? {}).length,
        generatedAt: embeddings?.generatedAt ?? null,
      },
    },
  });
}

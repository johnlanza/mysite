import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";

import { readBookNotesDataset } from "@/lib/book-notes-data";
import { EMBEDDINGS_DATA_FILE, type EmbeddingsFile } from "@/lib/embeddings";
import { readQuestionsDataset } from "@/lib/questions-data";
import { readQuotesDataset } from "@/lib/quotes-data";

export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const ROOT = process.env.ZETTE_ROOT ?? process.cwd();

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

async function runScript(scriptName: string) {
  try {
    await execFileAsync(process.execPath, [`${ROOT}/scripts/${scriptName}`], {
      cwd: ROOT,
      env: process.env,
      maxBuffer: 1024 * 1024 * 10,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Failed to run ${scriptName}`;

    return Response.json(
      {
        error: message,
        script: scriptName,
      },
      { status: 500 },
    );
  }

  return null;
}

export async function GET() {
  const [quotes, bookNotes, questions, embeddings] = await Promise.all([
    readQuotesDataset(),
    readBookNotesDataset(),
    readQuestionsDataset(),
    readEmbeddingsFile(),
  ]);
  const generatedAt = latestGeneratedAt([
    quotes.generatedAt,
    bookNotes.generatedAt,
    questions.generatedAt,
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
      embeddings: {
        count: Object.keys(embeddings?.entries ?? {}).length,
        generatedAt: embeddings?.generatedAt ?? null,
      },
    },
  });
}

export async function POST() {
  for (const scriptName of [
    "build-quotes-dataset.mjs",
    "build-book-notes-dataset.mjs",
    "build-questions-dataset.mjs",
    "build-embeddings.mjs",
  ]) {
    const errorResponse = await runScript(scriptName);

    if (errorResponse) {
      return errorResponse;
    }
  }

  const dataset = await readQuotesDataset();

  return Response.json({
    generatedAt: dataset.generatedAt,
    stats: dataset.stats,
    embeddingsRefreshed: true,
  });
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { readQuotesDataset } from "@/lib/quotes-data";

const execFileAsync = promisify(execFile);
const ROOT = process.env.ZETTE_ROOT ?? process.cwd();

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

export async function POST() {
  for (const scriptName of [
    "build-quotes-dataset.mjs",
    "build-book-notes-dataset.mjs",
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

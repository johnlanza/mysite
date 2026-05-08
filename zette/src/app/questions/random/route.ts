import type { NextRequest } from "next/server";

import { withBasePath } from "@/lib/base-path";
import {
  getPreferredQuestionPool,
  readQuestionsDataset,
} from "@/lib/questions-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const dataset = await readQuestionsDataset();
  const preferredPool = getPreferredQuestionPool(dataset.questions);
  const pool = preferredPool.filter((question) => question.id !== from);
  const fallbackPool = dataset.questions.filter((question) => question.id !== from);
  const questions =
    pool.length > 0
      ? pool
      : fallbackPool.length > 0
        ? fallbackPool
        : preferredPool.length > 0
          ? preferredPool
          : dataset.questions;
  const pick = questions[Math.floor(Math.random() * questions.length)];

  return new Response(null, {
    status: 307,
    headers: {
      Location: withBasePath(`/questions?q=${encodeURIComponent(pick.id)}`),
      "Cache-Control": "no-store",
    },
  });
}

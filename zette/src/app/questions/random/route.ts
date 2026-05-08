import type { NextRequest } from "next/server";

import { withBasePath } from "@/lib/base-path";
import { readQuestionsDataset } from "@/lib/questions-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const dataset = await readQuestionsDataset();
  const pool = dataset.questions.filter((question) => question.id !== from);
  const questions = pool.length > 0 ? pool : dataset.questions;
  const pick = questions[Math.floor(Math.random() * questions.length)];

  return new Response(null, {
    status: 307,
    headers: {
      Location: withBasePath(`/questions?q=${encodeURIComponent(pick.id)}`),
      "Cache-Control": "no-store",
    },
  });
}

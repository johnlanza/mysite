import type { NextRequest } from "next/server";

import { withBasePath } from "@/lib/base-path";
import {
  getPreferredQuestionPool,
  readQuestionsDataset,
} from "@/lib/questions-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const seen = [...new Set(request.nextUrl.searchParams.getAll("seen"))];
  const dataset = await readQuestionsDataset();
  const preferredPool = getPreferredQuestionPool(dataset.questions);
  const unseenPool = preferredPool.filter(
    (question) => question.id !== from && !seen.includes(question.id),
  );
  const resetPool = preferredPool.filter((question) => question.id !== from);
  const questions =
    unseenPool.length > 0
      ? unseenPool
      : resetPool.length > 0
        ? resetPool
        : preferredPool.length > 0
          ? preferredPool
          : dataset.questions;
  const pick = questions[Math.floor(Math.random() * questions.length)];

  return new Response(null, {
    status: 307,
    headers: {
      Location: withBasePath(
        `/questions?${(() => {
          const params = new URLSearchParams();
          params.set("q", pick.id);

          const nextSeen = unseenPool.length > 0 ? seen : [];

          for (const id of nextSeen) {
            params.append("seen", id);
          }

          return params.toString();
        })()}`,
      ),
      "Cache-Control": "no-store",
    },
  });
}

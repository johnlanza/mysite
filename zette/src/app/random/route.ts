import type { NextRequest } from "next/server";

import { withBasePath } from "@/lib/base-path";
import { readAllPieces } from "@/lib/pieces";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const tags = request.nextUrl.searchParams.get("tags");
  const pieces = await readAllPieces();

  const eligible = pieces.filter(
    (p) => p.text.length >= 60 && p.id !== from,
  );
  const pool = eligible.length > 0 ? eligible : pieces;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const params = new URLSearchParams();

  if (tags) {
    params.set("tags", tags);
  }

  params.set("p", pick.id);

  return new Response(null, {
    status: 307,
    headers: {
      Location: withBasePath(`/?${params.toString()}`),
      "Cache-Control": "no-store",
    },
  });
}

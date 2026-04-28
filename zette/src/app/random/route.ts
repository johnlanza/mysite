import type { NextRequest } from "next/server";

import { withBasePath } from "@/lib/base-path";
import { readAllPieces } from "@/lib/pieces";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const pieces = await readAllPieces();

  const eligible = pieces.filter(
    (p) => p.text.length >= 60 && p.id !== from,
  );
  const pool = eligible.length > 0 ? eligible : pieces;
  const pick = pool[Math.floor(Math.random() * pool.length)];

  return new Response(null, {
    status: 307,
    headers: {
      Location: withBasePath(`/?p=${encodeURIComponent(pick.id)}`),
      "Cache-Control": "no-store",
    },
  });
}

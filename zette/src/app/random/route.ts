import type { NextRequest } from "next/server";

import { withBasePath } from "@/lib/base-path";
import { getDailySeedKey, readAllPieces } from "@/lib/pieces";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const tags = request.nextUrl.searchParams.get("tags");
  const requestedPath = request.nextUrl.searchParams.get("path");
  const targetPath = requestedPath === "/now" ? "/now" : "/";
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
  params.set("day", getDailySeedKey());

  return new Response(null, {
    status: 307,
    headers: {
      Location: withBasePath(`${targetPath}?${params.toString()}`),
      "Cache-Control": "no-store",
    },
  });
}

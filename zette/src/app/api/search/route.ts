import type { NextRequest } from "next/server";

import {
  cosineSimilarity,
  readEmbeddings,
  type EmbeddingsIndex,
} from "@/lib/embeddings";
import { readSearchPieces, type Piece } from "@/lib/pieces";

export const dynamic = "force-dynamic";

const MODEL = "text-embedding-3-small";
const DIMENSIONS = 512;

function parseQuery(query: string): string[] {
  const tokens = [];
  const quotedPattern = /"([^"]+)"/g;
  let remainder = query;

  for (const match of query.matchAll(quotedPattern)) {
    const phrase = match[1]?.trim().toLowerCase();
    if (phrase) tokens.push(phrase);
    remainder = remainder.replace(match[0], " ");
  }

  for (const token of remainder.toLowerCase().split(/\s+/)) {
    const cleaned = token.trim();
    if (cleaned) tokens.push(cleaned);
  }

  return tokens;
}

function pieceHaystack(piece: Piece): string {
  return [
    piece.text,
    piece.note ?? "",
    piece.attribution ?? "",
    piece.context ?? "",
    piece.sourceDisplay,
    piece.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function lexicalScore(piece: Piece, query: string, tokens: string[]) {
  if (tokens.length === 0) {
    return 0;
  }

  const haystack = pieceHaystack(piece);
  const matches = tokens.filter((token) => haystack.includes(token)).length;

  if (matches === 0) {
    return 0;
  }

  const exactPhrase = query.length >= 4 && haystack.includes(query);
  const matchRatio = matches / tokens.length;
  let score = matchRatio * 0.45;

  if (matches === tokens.length) score += 0.3;
  if (exactPhrase) score += 0.18;
  if (piece.kind === "quote" || piece.kind === "note") score += 0.04;
  if (piece.kind === "question") score += 0.03;
  if (piece.kind === "brain") score += Math.min(0.06, (piece.searchScore ?? 0) * 0.01);

  return score;
}

async function embedQuery(query: string) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || query.length < 3) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: query,
      dimensions: DIMENSIONS,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };

  return payload.data?.[0]?.embedding ?? null;
}

function addResult(
  results: Map<string, { piece: Piece; score: number }>,
  piece: Piece,
  score: number,
) {
  const prior = results.get(piece.id);

  if (!prior || prior.score < score) {
    results.set(piece.id, { piece, score });
  }
}

function addSemanticResults(
  results: Map<string, { piece: Piece; score: number }>,
  pieces: Piece[],
  embeddings: EmbeddingsIndex | null,
  queryVector: number[] | null,
) {
  if (!embeddings || !queryVector) {
    return;
  }

  for (const piece of pieces) {
    const vector = embeddings.byId.get(piece.id);

    if (!vector) {
      continue;
    }

    const similarity = cosineSimilarity(queryVector, vector);

    if (similarity < 0.29) {
      continue;
    }

    let score = similarity;
    if (piece.kind === "quote" || piece.kind === "note") score += 0.04;
    if (piece.kind === "question") score += 0.035;
    if (piece.kind === "brain") score += Math.min(0.05, (piece.searchScore ?? 0) * 0.008);

    addResult(results, piece, score);
  }
}

export async function GET(request: NextRequest) {
  const rawQuery = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const selectedTags = (request.nextUrl.searchParams.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const limit = Math.min(
    80,
    Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "24", 10)),
  );
  const tokens = parseQuery(rawQuery);
  const [pieces, embeddings, queryVector] = await Promise.all([
    readSearchPieces(),
    readEmbeddings(),
    embedQuery(rawQuery),
  ]);
  const scopedPieces = pieces.filter((piece) =>
    selectedTags.every((tag) => piece.tags.includes(tag)),
  );
  const results = new Map<string, { piece: Piece; score: number }>();

  for (const piece of scopedPieces) {
    const score = lexicalScore(piece, rawQuery.toLowerCase(), tokens);

    if (score >= 0.24 || (tokens.length > 0 && score > 0 && piece.kind !== "brain")) {
      addResult(results, piece, score);
    }
  }

  addSemanticResults(results, scopedPieces, embeddings, queryVector);

  const sorted = [...results.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ piece, score }) => ({
      ...piece,
      searchScore: Number(score.toFixed(4)),
    }));

  return Response.json({
    semantic: Boolean(queryVector),
    count: sorted.length,
    results: sorted,
  });
}

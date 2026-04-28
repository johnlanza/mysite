"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { Piece } from "@/lib/pieces";

type PieceSearchProps = {
  pieces: Piece[];
};

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

function resultLabel(piece: Piece): string {
  if (piece.kind === "quote") {
    return piece.attribution ?? piece.sourceDisplay;
  }

  return piece.context ?? piece.sourceDisplay;
}

export function PieceSearch({ pieces }: PieceSearchProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim();

  const results = useMemo(() => {
    const tokens = parseQuery(normalizedQuery);

    if (tokens.length === 0) {
      return [];
    }

    return pieces
      .filter((piece) => {
        const haystack = pieceHaystack(piece);
        return tokens.every((token) => haystack.includes(token));
      })
      .slice(0, 12);
  }, [normalizedQuery, pieces]);

  return (
    <section className="mx-auto w-full max-w-[34rem] px-7 pt-5 sm:px-10">
      <label className="sr-only" htmlFor="piece-search">
        Search Zette
      </label>
      <input
        id="piece-search"
        className="w-full rounded-full border border-line bg-card/90 px-5 py-3 text-sm text-foreground shadow-[0_8px_24px_rgba(89,64,34,0.07)] outline-none transition placeholder:text-muted/70 focus:border-accent"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search words or phrases"
        type="search"
        value={query}
      />

      {normalizedQuery ? (
        <div className="mt-3 overflow-hidden rounded-[1.25rem] border border-line bg-card/95 shadow-[0_16px_40px_rgba(89,64,34,0.08)]">
          {results.length > 0 ? (
            <ul className="max-h-[22rem] overflow-y-auto">
              {results.map((piece) => (
                <li key={piece.id} className="border-b border-line last:border-b-0">
                  <Link
                    className="block px-5 py-4 transition hover:bg-accent-soft/40"
                    href={`/?p=${encodeURIComponent(piece.id)}`}
                    onClick={() => setQuery("")}
                  >
                    <p
                      className="font-serif text-[1.05rem] leading-snug text-foreground"
                      style={{
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: 3,
                        overflow: "hidden",
                      }}
                    >
                      {piece.text}
                    </p>
                    {piece.note ? (
                      <p
                        className="mt-3 border-l-2 border-accent-soft pl-3 text-[0.8rem] leading-snug text-muted"
                        style={{
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: 2,
                          overflow: "hidden",
                        }}
                      >
                        {piece.note}
                      </p>
                    ) : null}
                    <p className="mt-3 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted">
                      {resultLabel(piece)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-sm text-muted">No matches</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

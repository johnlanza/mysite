"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { RefreshQuotesButton } from "@/components/refresh-quotes-button";
import type { Piece } from "@/lib/pieces";

type PieceSearchProps = {
  pieces: Piece[];
  tags: string[];
  selectedTag: string | null;
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

function pieceHref(piece: Piece, selectedTag: string | null): string {
  const params = new URLSearchParams();

  if (selectedTag) {
    params.set("tag", selectedTag);
  }

  params.set("p", piece.id);

  return `/?${params.toString()}`;
}

function tagHref(tag: string | null): string {
  if (!tag) {
    return "/";
  }

  return `/?tag=${encodeURIComponent(tag)}`;
}

export function PieceSearch({ pieces, tags, selectedTag }: PieceSearchProps) {
  const [query, setQuery] = useState("");
  const [showTags, setShowTags] = useState(false);
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
      <div className="flex items-center gap-2">
        <input
          id="piece-search"
          className="min-w-0 flex-1 rounded-full border border-line bg-card/90 px-5 py-3 text-sm text-foreground shadow-[0_8px_24px_rgba(89,64,34,0.07)] outline-none transition placeholder:text-muted/70 focus:border-accent"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search words or phrases"
          type="search"
          value={query}
        />
        <button
          aria-expanded={showTags}
          className={`shrink-0 rounded-full border px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.2em] shadow-[0_8px_24px_rgba(89,64,34,0.07)] transition ${
            selectedTag
              ? "border-accent bg-accent text-[#f8f2e9]"
              : "border-line bg-card/90 text-muted hover:border-accent hover:text-accent"
          }`}
          onClick={() => setShowTags((value) => !value)}
          type="button"
        >
          {selectedTag ? `#${selectedTag}` : "Library"}
        </button>
      </div>

      {showTags ? (
        <div className="capsule-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          <Link
            className="shrink-0 rounded-full border border-line bg-card/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted transition hover:border-accent hover:text-accent"
            href="/library"
          >
            Browse
          </Link>
          <Link
            className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
              selectedTag
                ? "border-line bg-card/80 text-muted hover:border-accent hover:text-accent"
                : "border-accent bg-accent text-[#f8f2e9]"
            }`}
            href={tagHref(null)}
          >
            All
          </Link>
          {tags.map((tag) => (
            <Link
              key={tag}
              className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                selectedTag === tag
                  ? "border-accent bg-accent text-[#f8f2e9]"
                  : "border-line bg-card/80 text-muted hover:border-accent hover:text-accent"
              }`}
              href={tagHref(tag)}
            >
              #{tag}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted/70">
        <span>
          {selectedTag ? `Drawing from #${selectedTag}` : "Drawing from all notes"}
        </span>
        <RefreshQuotesButton compact />
      </div>

      {normalizedQuery ? (
        <div className="mt-3 overflow-hidden rounded-[1.25rem] border border-line bg-card/95 shadow-[0_16px_40px_rgba(89,64,34,0.08)]">
          {results.length > 0 ? (
            <ul className="max-h-[22rem] overflow-y-auto">
              {results.map((piece) => (
                <li key={piece.id} className="border-b border-line last:border-b-0">
                  <Link
                    className="block px-5 py-4 transition hover:bg-accent-soft/40"
                    href={pieceHref(piece, selectedTag)}
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

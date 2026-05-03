"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { RefreshQuotesButton } from "@/components/refresh-quotes-button";
import type { Piece } from "@/lib/pieces";

type PieceSearchProps = {
  pieces: Piece[];
  tags: string[];
  selectedTags: string[];
  mode?: "compact" | "browse";
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

function pieceHref(piece: Piece, selectedTags: string[]): string {
  const params = new URLSearchParams();

  if (selectedTags.length > 0) {
    params.set("tags", selectedTags.join(","));
  }

  params.set("p", piece.id);

  return `/?${params.toString()}`;
}

function tagsHref(selectedTags: string[], tag: string | null): string {
  if (!tag) {
    return "/";
  }

  const nextTags = selectedTags.includes(tag)
    ? selectedTags.filter((value) => value !== tag)
    : [...selectedTags, tag];

  if (nextTags.length === 0) {
    return "/";
  }

  return `/?tags=${encodeURIComponent(nextTags.join(","))}`;
}

export function PieceSearch({
  pieces,
  tags,
  selectedTags,
  mode = "compact",
}: PieceSearchProps) {
  const [query, setQuery] = useState("");
  const isBrowse = mode === "browse";
  const [showTags, setShowTags] = useState(isBrowse);
  const normalizedQuery = query.trim();
  const resultLimit = isBrowse ? 160 : selectedTags.length > 0 ? 80 : 12;

  const results = useMemo(() => {
    const tokens = parseQuery(normalizedQuery);

    if (tokens.length === 0 && selectedTags.length === 0) {
      return [];
    }

    return pieces
      .filter((piece) => {
        const matchesTags = selectedTags.every((tag) => piece.tags.includes(tag));
        if (!matchesTags) return false;

        if (tokens.length === 0) return true;

        const haystack = pieceHaystack(piece);
        return tokens.every((token) => haystack.includes(token));
      })
      .slice(0, resultLimit);
  }, [normalizedQuery, pieces, resultLimit, selectedTags]);

  const showResults =
    normalizedQuery.length > 0 || (isBrowse && selectedTags.length > 0);
  const selectedLabel = selectedTags.map((tag) => `#${tag}`).join(" + ");

  return (
    <section
      className={`mx-auto w-full px-7 sm:px-10 ${
        isBrowse ? "max-w-[58rem] py-8" : "max-w-[34rem] pt-5"
      }`}
    >
      {isBrowse ? (
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-sans text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-accent">
              Tags
            </p>
            <h1 className="mt-2 font-serif text-[2.4rem] leading-[1.05] text-foreground sm:text-[3.2rem]">
              {selectedLabel || "Browse Zette"}
            </h1>
          </div>
          <Link
            href="/"
            className="inline-flex w-fit items-center rounded-full border border-line bg-card/85 px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted shadow-[0_8px_24px_rgba(89,64,34,0.07)] transition hover:border-accent hover:text-accent"
          >
            Featured Card
          </Link>
        </div>
      ) : null}

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
            selectedTags.length > 0
              ? "border-accent bg-accent text-[#f8f2e9]"
              : "border-line bg-card/90 text-muted hover:border-accent hover:text-accent"
          }`}
          onClick={() => setShowTags((value) => !value)}
          type="button"
        >
          {selectedTags.length > 0 ? `${selectedTags.length} Tags` : "Tags"}
        </button>
      </div>

      {showTags ? (
        <div
          className={`mt-3 flex gap-2 ${
            isBrowse
              ? "flex-wrap"
              : "capsule-scrollbar overflow-x-auto pb-1"
          }`}
        >
          <Link
            className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
              selectedTags.length > 0
                ? "border-line bg-card/80 text-muted hover:border-accent hover:text-accent"
                : "border-accent bg-accent text-[#f8f2e9]"
            }`}
            href={tagsHref(selectedTags, null)}
          >
            All
          </Link>
          {tags.map((tag) => (
            <Link
              key={tag}
              className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                selectedTags.includes(tag)
                  ? "border-accent bg-accent text-[#f8f2e9]"
                  : "border-line bg-card/80 text-muted hover:border-accent hover:text-accent"
              }`}
              href={tagsHref(selectedTags, tag)}
            >
              #{tag}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted/70">
        <span>
          {isBrowse && selectedTags.length > 0
            ? `${results.length} cards match ${selectedLabel}`
            : selectedTags.length > 0
              ? `Browsing ${selectedLabel}`
            : "Search or browse tags"}
        </span>
        <RefreshQuotesButton compact />
      </div>

      {showResults ? (
        <div
          className={`mt-4 overflow-hidden border border-line bg-card/95 shadow-[0_16px_40px_rgba(89,64,34,0.08)] ${
            isBrowse ? "rounded-[1.5rem]" : "rounded-[1.25rem]"
          }`}
        >
          {results.length > 0 ? (
            <ul
              className={
                isBrowse
                  ? "grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0"
                  : "max-h-[22rem] overflow-y-auto"
              }
            >
              {results.map((piece) => (
                <li
                  key={piece.id}
                  className={isBrowse ? "border-b border-line" : "border-b border-line last:border-b-0"}
                >
                  <Link
                    className={`block transition hover:bg-accent-soft/40 ${
                      isBrowse ? "h-full px-6 py-5 sm:px-7 sm:py-6" : "px-5 py-4"
                    }`}
                    href={pieceHref(piece, selectedTags)}
                    onClick={() => setQuery("")}
                  >
                    <p
                      className={`font-serif leading-snug text-foreground ${
                        isBrowse ? "text-[1.18rem]" : "text-[1.05rem]"
                      }`}
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

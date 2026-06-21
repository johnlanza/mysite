"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PieceNoteBox } from "@/components/piece-note-box";
import { RefreshQuotesButton } from "@/components/refresh-quotes-button";
import type { Piece } from "@/lib/pieces";

type PieceSearchProps = {
  pieces: Piece[];
  tags: string[];
  selectedTags: string[];
  mode?: "compact" | "browse";
};

type TagSortMode = "alphabetical" | "frequency";
const TAG_SORT_OPTIONS: { value: TagSortMode; label: string }[] = [
  { value: "alphabetical", label: "Alphabetical" },
  { value: "frequency", label: "Frequency" },
];

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
  const [tagSort, setTagSort] = useState<TagSortMode>("alphabetical");
  const normalizedQuery = query.trim();
  const resultLimit = isBrowse && selectedTags.length > 0
    ? null
    : isBrowse
      ? 160
      : selectedTags.length > 0
        ? 80
        : 12;

  const tagCounts = useMemo(() => {
    const counts = new Map(tags.map((tag) => [tag, 0]));

    for (const piece of pieces) {
      for (const tag of piece.tags) {
        if (counts.has(tag)) {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }
    }

    return counts;
  }, [pieces, tags]);

  const sortedTags = useMemo(() => {
    return [...tags].sort((firstTag, secondTag) => {
      if (tagSort === "frequency") {
        const frequencyDifference =
          (tagCounts.get(secondTag) ?? 0) - (tagCounts.get(firstTag) ?? 0);

        if (frequencyDifference !== 0) {
          return frequencyDifference;
        }
      }

      return firstTag.localeCompare(secondTag);
    });
  }, [tagCounts, tagSort, tags]);

  const results = useMemo(() => {
    const tokens = parseQuery(normalizedQuery);

    if (tokens.length === 0 && selectedTags.length === 0) {
      return [];
    }

    const filtered = pieces.filter((piece) => {
      const matchesTags = selectedTags.every((tag) => piece.tags.includes(tag));
      if (!matchesTags) return false;

      if (tokens.length === 0) return true;

      const haystack = pieceHaystack(piece);
      return tokens.every((token) => haystack.includes(token));
    });

    return resultLimit === null ? filtered : filtered.slice(0, resultLimit);
  }, [normalizedQuery, pieces, resultLimit, selectedTags]);

  const showResults =
    normalizedQuery.length > 0 || (isBrowse && selectedTags.length > 0);
  const selectedLabel = selectedTags.map((tag) => `#${tag}`).join(" + ");
  const compactSummary =
    selectedTags.length > 0 ? `Browsing ${selectedLabel}` : "Search or browse tags";

  return (
    <section
      className={`mx-auto w-full px-7 sm:px-10 ${
        isBrowse ? "max-w-[58rem] py-8" : "max-w-[38rem] pt-6"
      }`}
    >
      {isBrowse ? (
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-sans text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-accent">
              Tags
            </p>
            <h1 className="mt-2 font-serif text-[2.25rem] leading-[1.04] text-foreground sm:text-[3rem]">
              {selectedLabel || "Browse Zette"}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/questions"
              className="inline-flex w-fit items-center rounded-full border border-line bg-card/80 px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted shadow-[0_10px_28px_rgba(89,64,34,0.06)] transition hover:border-accent hover:text-accent"
            >
              Questions
            </Link>
            <Link
              href="/"
              className="inline-flex w-fit items-center rounded-full border border-line bg-card/80 px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted shadow-[0_10px_28px_rgba(89,64,34,0.06)] transition hover:border-accent hover:text-accent"
            >
              Featured Card
            </Link>
          </div>
        </div>
      ) : null}

      <div className="rounded-[1.6rem] border border-line bg-card/82 p-3 shadow-[0_18px_48px_rgba(89,64,34,0.07)] backdrop-blur-sm">
        <label className="sr-only" htmlFor="piece-search">
          Search Zette
        </label>
        <div className="flex items-center gap-2">
          <input
            id="piece-search"
            className="min-w-0 flex-1 rounded-full border border-line/80 bg-[#fffaf3]/85 px-5 py-3 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search words or phrases"
            type="search"
            value={query}
          />
          <button
            aria-expanded={showTags}
            className={`shrink-0 rounded-full border px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.2em] transition ${
              selectedTags.length > 0
                ? "border-accent bg-accent text-[#f8f2e9]"
                : "border-line bg-[#fffaf3]/85 text-muted hover:border-accent hover:text-accent"
            }`}
            onClick={() => setShowTags((value) => !value)}
            type="button"
          >
            {selectedTags.length > 0 ? `${selectedTags.length} Tags` : "Tags"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/questions"
              className="inline-flex items-center rounded-full border border-line bg-transparent px-3.5 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted transition hover:border-accent hover:text-accent"
            >
              Questions
            </Link>
            {selectedTags.length > 0 ? (
              <Link
                href="/"
                className="inline-flex items-center rounded-full border border-line bg-transparent px-3.5 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted transition hover:border-accent hover:text-accent"
              >
                Clear Tags
              </Link>
            ) : null}
          </div>
          <RefreshQuotesButton compact />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted/70">
          <span>{isBrowse && selectedTags.length > 0 ? `${results.length} cards match ${selectedLabel}` : compactSummary}</span>
          {normalizedQuery.length > 0 ? <span>{results.length} matches</span> : null}
        </div>

        {showTags ? (
          <div className="mt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted/70">
                Sort
              </span>
              <div
                aria-label="Sort tags"
                className="inline-flex rounded-full border border-line bg-[#fffaf3]/75 p-0.5"
                role="group"
              >
                {TAG_SORT_OPTIONS.map(({ value, label }) => {
                  const active = tagSort === value;

                  return (
                    <button
                      key={value}
                      aria-pressed={active}
                      className={`rounded-full px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] transition ${
                        active
                          ? "bg-accent text-[#f8f2e9]"
                          : "text-muted hover:text-accent"
                      }`}
                      onClick={() => setTagSort(value)}
                      type="button"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div
              className={`flex gap-2 ${
                isBrowse
                  ? "flex-wrap"
                  : "capsule-scrollbar overflow-x-auto pb-1"
              }`}
            >
              <Link
                className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                  selectedTags.length > 0
                    ? "border-line bg-[#fffaf3]/75 text-muted hover:border-accent hover:text-accent"
                    : "border-accent bg-accent text-[#f8f2e9]"
                }`}
                href={tagsHref(selectedTags, null)}
              >
                All
              </Link>
              {sortedTags.map((tag) => (
                <Link
                  key={tag}
                  className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    selectedTags.includes(tag)
                      ? "border-accent bg-accent text-[#f8f2e9]"
                      : "border-line bg-[#fffaf3]/75 text-muted hover:border-accent hover:text-accent"
                  }`}
                  href={tagsHref(selectedTags, tag)}
                >
                  #{tag}
                  {tagSort === "frequency" ? (
                    <>
                      {" "}
                      <span className="ml-1 tabular-nums text-current/65">
                        {tagCounts.get(tag) ?? 0}
                      </span>
                    </>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {showResults ? (
        <div className="mt-4">
          {results.length > 0 ? (
            <ul
              className={
                isBrowse
                  ? "grid gap-3 sm:grid-cols-2"
                  : "max-h-[22rem] space-y-3 overflow-y-auto pr-1"
              }
            >
              {results.map((piece) => (
                <li key={piece.id}>
                  <PieceNoteBox
                    className={isBrowse ? "h-full sm:px-6 sm:py-5" : ""}
                    href={pieceHref(piece, selectedTags)}
                    piece={piece}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-[1.25rem] border border-line bg-card/78 px-5 py-4 text-sm text-muted">
              No matches
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

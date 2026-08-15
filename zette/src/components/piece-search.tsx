"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PieceNoteBox } from "@/components/piece-note-box";
import { RefreshQuotesButton } from "@/components/refresh-quotes-button";
import { withBasePath } from "@/lib/base-path";
import type { Piece } from "@/lib/pieces";

type PieceSearchProps = {
  pieces: Piece[];
  tags: string[];
  selectedTags: string[];
  mode?: "compact" | "browse";
  piecePath?: string;
  onSelectPiece?: () => void;
};

type TagSortMode = "alphabetical" | "frequency";
const TAG_SORT_OPTIONS: { value: TagSortMode; label: string }[] = [
  { value: "alphabetical", label: "Alphabetical" },
  { value: "frequency", label: "Frequency" },
];

function pieceHref(piece: Piece, selectedTags: string[], piecePath: string): string {
  const params = new URLSearchParams();

  if (selectedTags.length > 0) {
    params.set("tags", selectedTags.join(","));
  }

  params.set("p", piece.id);

  return `${piecePath}?${params.toString()}`;
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
  piecePath = "/",
  onSelectPiece,
}: PieceSearchProps) {
  const [query, setQuery] = useState("");
  const isBrowse = mode === "browse";
  const [showTags, setShowTags] = useState(isBrowse);
  const [tagSort, setTagSort] = useState<TagSortMode>("alphabetical");
  const [remoteResults, setRemoteResults] = useState<Piece[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
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

  const localResults = useMemo(() => {
    if (selectedTags.length === 0) {
      return [];
    }

    const filtered = pieces.filter((piece) => {
      const matchesTags = selectedTags.every((tag) => piece.tags.includes(tag));
      if (!matchesTags) return false;

      return true;
    });

    return resultLimit === null ? filtered : filtered.slice(0, resultLimit);
  }, [pieces, resultLimit, selectedTags]);

  useEffect(() => {
    if (!normalizedQuery) {
      setRemoteResults(null);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    setRemoteResults(null);
    const timer = window.setTimeout(async () => {
      setIsSearching(true);

      try {
        const params = new URLSearchParams({
          q: normalizedQuery,
          limit: String(resultLimit ?? 80),
        });

        if (selectedTags.length > 0) {
          params.set("tags", selectedTags.join(","));
        }

        const response = await fetch(withBasePath(`/api/search?${params.toString()}`), {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          setRemoteResults([]);
          return;
        }

        const payload = (await response.json()) as { results?: Piece[] };
        setRemoteResults(payload.results ?? []);
      } catch (error) {
        if ((error as DOMException).name !== "AbortError") {
          setRemoteResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [normalizedQuery, resultLimit, selectedTags]);

  const results = normalizedQuery ? remoteResults ?? [] : localResults;

  const showResults =
    normalizedQuery.length > 0 || (isBrowse && selectedTags.length > 0);
  const selectedLabel = selectedTags.map((tag) => `#${tag}`).join(" + ");

  return (
    <section
      className={`mx-auto w-full px-7 sm:px-10 ${
        isBrowse ? "max-w-[58rem] py-8" : "max-w-[38rem] pt-6"
      }`}
    >
      {isBrowse ? (
        <div className="mb-7">
          <p className="font-sans text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-accent">
            Tags
          </p>
          <h1 className="mt-2 font-serif text-[2.25rem] leading-[1.04] text-foreground sm:text-[3rem]">
            {selectedLabel || "Browse Zette"}
          </h1>
        </div>
      ) : null}

      <div className="rounded-[1.6rem] border border-line bg-card/82 p-3 shadow-[0_18px_48px_rgba(89,64,34,0.07)] backdrop-blur-sm">
        <label className="sr-only" htmlFor="piece-search">
          Search Zette
        </label>
        <div>
          <input
            id="piece-search"
            className="w-full rounded-full border border-line/80 bg-[#fffaf3]/85 px-5 py-3 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search words or phrases"
            type="search"
            value={query}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/questions"
              className="inline-flex items-center rounded-full border border-line bg-transparent px-3.5 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted transition hover:border-accent hover:text-accent"
            >
              Questions
            </Link>
            <button
              aria-expanded={showTags}
              className={`inline-flex items-center rounded-full border px-3.5 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] transition ${
                selectedTags.length > 0
                  ? "border-accent bg-accent text-[#f8f2e9]"
                  : "border-line bg-transparent text-muted hover:border-accent hover:text-accent"
              }`}
              onClick={() => setShowTags((value) => !value)}
              type="button"
            >
              {selectedTags.length > 0 ? `${selectedTags.length} Tags` : "Tags"}
            </button>
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
            <div className="capsule-scrollbar flex gap-2 overflow-x-auto pb-1">
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
          {isSearching && remoteResults === null ? (
            <p className="rounded-[1.25rem] border border-line bg-card/78 px-5 py-4 text-sm text-muted">
              Searching...
            </p>
          ) : results.length > 0 ? (
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
                    href={pieceHref(piece, selectedTags, piecePath)}
                    onClick={onSelectPiece}
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

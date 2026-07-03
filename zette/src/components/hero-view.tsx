"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PieceNoteBox } from "@/components/piece-note-box";
import { PieceSearch } from "@/components/piece-search";
import { getDailyCardDateKey } from "@/lib/daily-card";
import { getLogseqUrl } from "@/lib/logseq";
import type { Piece } from "@/lib/pieces";

type HeroViewProps = {
  piece: Piece;
  echoes: Piece[];
  pieces: Piece[];
  tags: string[];
  selectedTags: string[];
  isSeed: boolean;
  echoesOpen: boolean;
  dailySeedKey: string;
  dailySeedTimeZone: string;
  drawDayKey: string | null;
  shouldResetMainCardUrl: boolean;
  dailyPath: string;
};

type SearchOverride = {
  routeKey: string;
  open: boolean;
};

function textSizeClass(length: number): string {
  if (length < 80) return "text-[2.75rem] leading-[1.08] sm:text-[3.25rem]";
  if (length < 160) return "text-[2.125rem] leading-[1.12] sm:text-[2.5rem]";
  if (length < 320) return "text-[1.625rem] leading-[1.2] sm:text-[1.875rem]";
  return "text-[1.25rem] leading-[1.35] sm:text-[1.5rem]";
}

function combinedLength(piece: Piece): number {
  return piece.text.length + (piece.note?.length ?? 0);
}

function buildNowHref(
  dailyPath: string,
  piece: Piece,
  isSeed: boolean,
  echoesOpen: boolean,
  selectedTags: string[],
  drawDayKey: string | null,
): string {
  const params = new URLSearchParams();
  if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
  if (!isSeed) {
    params.set("p", piece.id);
    if (drawDayKey) params.set("day", drawDayKey);
  }
  if (echoesOpen) params.set("e", "1");
  const qs = params.toString();
  return qs ? `${dailyPath}?${qs}` : dailyPath;
}

function buildDailyHref(dailyPath: string, selectedTags: string[]): string {
  if (selectedTags.length === 0) return dailyPath;

  return `${dailyPath}?${new URLSearchParams({
    tags: selectedTags.join(","),
  }).toString()}`;
}

export function HeroView({
  piece,
  echoes,
  pieces,
  tags,
  selectedTags,
  isSeed,
  echoesOpen,
  dailySeedKey,
  dailySeedTimeZone,
  drawDayKey,
  shouldResetMainCardUrl,
  dailyPath,
}: HeroViewProps) {
  const router = useRouter();
  const attribution = piece.attribution?.trim();
  const context = piece.context?.trim();
  const showContext =
    context &&
    context.length > 0 &&
    context.toLowerCase() !== (attribution ?? "").toLowerCase();

  const toggleHref =
    buildNowHref(
      dailyPath,
      piece,
      isSeed,
      !echoesOpen,
      selectedTags,
      drawDayKey,
    ) +
    "#echoes";
  const dailyHref = buildDailyHref(dailyPath, selectedTags);
  const logseqUrl = getLogseqUrl(piece.originType, piece.originFile, piece.blockId);
  const isBrowse = selectedTags.length > 0 && isSeed;
  const selectedTagsKey = selectedTags.join("\u001f");
  const searchRouteKey = `${isBrowse ? "browse" : "card"}:${selectedTagsKey}`;
  const [searchOverride, setSearchOverride] = useState<SearchOverride | null>(
    null,
  );
  const searchOpen =
    searchOverride?.routeKey === searchRouteKey ? searchOverride.open : isBrowse;
  const showBrowseSearch = isBrowse && searchOpen;
  const drawParams = new URLSearchParams({
    ...(selectedTags.length > 0 ? { tags: selectedTags.join(",") } : {}),
    from: piece.id,
  });
  if (dailyPath !== "/") drawParams.set("path", dailyPath);

  useEffect(() => {
    const resetMainCard = () => {
      if (shouldResetMainCardUrl) {
        router.replace(dailyHref);
        return;
      }

      if (getDailyCardDateKey(new Date(), dailySeedTimeZone) === dailySeedKey) {
        return;
      }

      if (drawDayKey) {
        router.replace(dailyHref);
        return;
      }

      if (isSeed) {
        router.refresh();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") resetMainCard();
    };

    resetMainCard();

    const timer = window.setInterval(resetMainCard, 60_000);
    window.addEventListener("focus", resetMainCard);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", resetMainCard);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    dailyHref,
    dailySeedKey,
    dailySeedTimeZone,
    drawDayKey,
    isSeed,
    router,
    shouldResetMainCardUrl,
  ]);

  return (
    <div className="flex min-h-[100dvh] w-full flex-col">
      <header className="mx-auto flex w-full max-w-[38rem] items-center justify-between px-7 pt-7 sm:px-10">
        <Link
          href="/"
          aria-label="Go to today's card"
          className="font-sans text-[0.64rem] font-semibold uppercase tracking-[0.26em] text-muted/55 transition hover:text-accent"
          onClick={() => setSearchOverride(null)}
        >
          Zette
        </Link>
        <button
          aria-controls="zette-search"
          aria-expanded={searchOpen}
          className={`rounded-full border px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.22em] transition ${
            searchOpen
              ? "border-accent bg-accent text-[#f8f2e9]"
              : "border-line bg-card/55 text-muted/75 hover:border-accent hover:text-accent"
          }`}
          onClick={() =>
            setSearchOverride({ routeKey: searchRouteKey, open: !searchOpen })
          }
          type="button"
        >
          Search
        </button>
      </header>

      {showBrowseSearch ? (
        <main id="zette-search" className="flex-1">
          <PieceSearch
            key="browse-search"
            pieces={pieces}
            tags={tags}
            selectedTags={selectedTags}
            mode="browse"
          />
        </main>
      ) : (
        <>
          {searchOpen ? (
            <div id="zette-search">
              <PieceSearch
                key="compact-search"
                pieces={pieces}
                tags={tags}
                selectedTags={selectedTags}
              />
            </div>
          ) : null}

          <main className="flex flex-1 flex-col items-center px-7 pb-10 pt-12 sm:px-10">
            {selectedTags.length > 0 && !isSeed ? (
              <Link
                href={buildDailyHref(dailyPath, selectedTags)}
                className="mb-8 inline-flex rounded-full border border-line bg-card/70 px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted transition hover:border-accent hover:text-accent"
              >
                Back to Tags
              </Link>
            ) : null}

            <article
              className={`mx-auto flex w-full max-w-[38rem] flex-col ${
                echoesOpen ? "" : "flex-1 justify-center"
              }`}
            >
              <p className="mb-6 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-accent/85">
                {isSeed ? "Featured card" : "Card"}
              </p>
              <p
                className={`font-serif font-normal tracking-tight text-foreground ${textSizeClass(combinedLength(piece))}`}
              >
                {piece.text}
              </p>

              {piece.note ? (
                <div className="mt-8 border-t border-line/80 pt-5 font-sans text-[0.95rem] leading-7 text-muted">
                  <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-accent/90">
                    My note
                  </p>
                  <p>{piece.note}</p>
                </div>
              ) : null}

              <div className="mt-8 border-t border-line/80 pt-5">
                {attribution ? (
                  <p className="font-sans text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-foreground/72">
                    — {attribution}
                  </p>
                ) : null}

                {showContext ? (
                  <p className="mt-2 font-serif text-[0.98rem] italic text-muted">
                    from {context}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <a
                    href={logseqUrl}
                    className="inline-flex items-center gap-1.5 font-sans text-[0.68rem] font-medium uppercase tracking-[0.24em] text-muted/70 transition hover:text-accent"
                  >
                    <span aria-hidden="true">↗</span>
                    <span>Open in Logseq</span>
                  </a>

                  {piece.sourceLocator ? (
                    <p className="font-sans text-[0.68rem] font-medium uppercase tracking-[0.22em] text-muted/55">
                      {piece.sourceLocator}
                    </p>
                  ) : null}
                </div>
              </div>

              {piece.tags.length > 0 ? (
                <ul className="mt-7 flex flex-wrap gap-2">
                  {piece.tags.map((tag) => (
                    <li key={tag}>
                      <Link
                        href={buildDailyHref(dailyPath, [tag])}
                        className="block rounded-full border border-line bg-card/55 px-3 py-1 text-[0.68rem] font-medium uppercase tracking-[0.18em] text-muted transition hover:border-accent hover:text-accent"
                      >
                        {tag}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>

            {echoesOpen && echoes.length > 0 ? (
              <section
                id="echoes"
                aria-label="Echoes"
                className="mx-auto mt-12 w-full max-w-[38rem] scroll-mt-4 border-t border-line/80 pt-8"
              >
                <h2 className="mb-4 font-sans text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-muted">
                  Echoes
                </h2>
                <ul className="flex flex-col gap-3">
                  {echoes.map((echo) => (
                    <li key={echo.id}>
                      <PieceNoteBox
                        href={`${dailyPath}?${new URLSearchParams({
                          ...(selectedTags.length > 0
                            ? { tags: selectedTags.join(",") }
                            : {}),
                          p: echo.id,
                        }).toString()}`}
                        piece={echo}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </main>

          <footer className="sticky bottom-0 w-full pb-6">
            <div className="mx-auto flex max-w-[38rem] items-center justify-center gap-2 px-7 sm:px-10">
              {echoes.length > 0 ? (
                <Link
                  href={toggleHref}
                  aria-expanded={echoesOpen}
                  scroll={true}
                  prefetch={false}
                  className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-line bg-card/88 px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-muted shadow-[0_10px_28px_rgba(89,64,34,0.08)] transition active:scale-[0.98]"
                >
                  <span className="text-foreground/80">
                    {echoesOpen ? "×" : "↓"}
                  </span>
                  <span>{echoesOpen ? "Hide" : "Echoes"}</span>
                  {!echoesOpen ? (
                    <span className="tabular-nums text-foreground/60">
                      {echoes.length}
                    </span>
                  ) : null}
                </Link>
              ) : (
                <span className="flex-1 rounded-full border border-line/60 bg-card/60 px-5 py-3 text-center text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-muted/70">
                  No echoes yet
                </span>
              )}

              <Link
                href={`/random?${drawParams.toString()}`}
                prefetch={false}
                aria-label="Draw another piece"
                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-line bg-card/88 px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-muted shadow-[0_10px_28px_rgba(89,64,34,0.08)] transition active:scale-[0.98]"
              >
                <span className="text-foreground/80">◈</span>
                <span>Draw</span>
              </Link>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

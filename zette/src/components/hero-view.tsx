import Link from "next/link";

import { PieceSearch } from "@/components/piece-search";
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

function echoTextClass(length: number): string {
  if (length < 140) return "text-[1.0625rem] leading-snug";
  return "text-[0.9375rem] leading-snug";
}

function buildNowHref(
  piece: Piece,
  isSeed: boolean,
  echoesOpen: boolean,
  selectedTags: string[],
): string {
  const params = new URLSearchParams();
  if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
  if (!isSeed) params.set("p", piece.id);
  if (echoesOpen) params.set("e", "1");
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export function HeroView({
  piece,
  echoes,
  pieces,
  tags,
  selectedTags,
  isSeed,
  echoesOpen,
}: HeroViewProps) {
  const attribution = piece.attribution?.trim();
  const context = piece.context?.trim();
  const showContext =
    context &&
    context.length > 0 &&
    context.toLowerCase() !== (attribution ?? "").toLowerCase();

  const toggleHref =
    buildNowHref(piece, isSeed, !echoesOpen, selectedTags) + "#echoes";
  const logseqUrl = getLogseqUrl(piece.originType, piece.originFile, piece.blockId);
  const isBrowse = selectedTags.length > 0 && isSeed;
  const viewLabel = isSeed ? "Today" : selectedTags.length > 0 ? "Selected" : "Card";

  return (
    <div className="flex min-h-[100dvh] w-full flex-col">
      <header className="mx-auto flex w-full max-w-[38rem] items-center justify-between px-7 pt-7 sm:px-10">
        <span className="font-sans text-[0.64rem] font-semibold uppercase tracking-[0.26em] text-muted/55">
          Zette
        </span>
        <span className="rounded-full border border-line bg-card/55 px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-muted/75">
          {viewLabel}
        </span>
      </header>

      {isBrowse ? (
        <main className="flex-1">
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
          <PieceSearch
            key="compact-search"
            pieces={pieces}
            tags={tags}
            selectedTags={selectedTags}
          />

          <main className="flex flex-1 flex-col items-center px-7 pb-10 pt-12 sm:px-10">
            {selectedTags.length > 0 ? (
              <Link
                href={`/?tags=${encodeURIComponent(selectedTags.join(","))}`}
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
                  {piece.tags.slice(0, 6).map((tag) => (
                    <li key={tag}>
                      <Link
                        href={`/?tags=${encodeURIComponent(tag)}`}
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
                      <Link
                        href={`/?${new URLSearchParams({
                          ...(selectedTags.length > 0
                            ? { tags: selectedTags.join(",") }
                            : {}),
                          p: echo.id,
                        }).toString()}`}
                        className="block w-full rounded-[1.25rem] border border-line bg-card/70 px-5 py-4 shadow-[0_12px_30px_rgba(89,64,34,0.05)] transition active:scale-[0.99] hover:border-accent/60"
                      >
                        <p
                          className={`font-serif text-foreground ${echoTextClass(echo.text.length)}`}
                          style={{
                            display: "-webkit-box",
                            WebkitBoxOrient: "vertical",
                            WebkitLineClamp: 4,
                            overflow: "hidden",
                          }}
                        >
                          {echo.text}
                        </p>
                        {echo.note ? (
                          <p
                            className="mt-3 border-l-2 border-accent-soft pl-3 text-[0.8rem] leading-snug text-muted"
                            style={{
                              display: "-webkit-box",
                              WebkitBoxOrient: "vertical",
                              WebkitLineClamp: 2,
                              overflow: "hidden",
                            }}
                          >
                            {echo.note}
                          </p>
                        ) : null}
                        {echo.attribution ? (
                          <p className="mt-3 font-sans text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted">
                            — {echo.attribution}
                          </p>
                        ) : null}
                      </Link>
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
                href={`/random?${new URLSearchParams({
                  ...(selectedTags.length > 0
                    ? { tags: selectedTags.join(",") }
                    : {}),
                  from: piece.id,
                }).toString()}`}
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

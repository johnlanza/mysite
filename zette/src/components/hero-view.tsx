import Link from "next/link";

import type { Piece } from "@/lib/pieces";

type HeroViewProps = {
  piece: Piece;
  echoes: Piece[];
  isSeed: boolean;
  echoesOpen: boolean;
};

function textSizeClass(length: number): string {
  if (length < 80) return "text-[2.75rem] leading-[1.08] sm:text-[3.25rem]";
  if (length < 160) return "text-[2.125rem] leading-[1.12] sm:text-[2.5rem]";
  if (length < 320) return "text-[1.625rem] leading-[1.2] sm:text-[1.875rem]";
  return "text-[1.25rem] leading-[1.35] sm:text-[1.5rem]";
}

function echoTextClass(length: number): string {
  if (length < 140) return "text-[1.0625rem] leading-snug";
  return "text-[0.9375rem] leading-snug";
}

function buildNowHref(piece: Piece, isSeed: boolean, echoesOpen: boolean): string {
  const params = new URLSearchParams();
  if (!isSeed) params.set("p", piece.id);
  if (echoesOpen) params.set("e", "1");
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export function HeroView({ piece, echoes, isSeed, echoesOpen }: HeroViewProps) {
  const attribution = piece.attribution?.trim();
  const context = piece.context?.trim();
  const showContext =
    context &&
    context.length > 0 &&
    context.toLowerCase() !== (attribution ?? "").toLowerCase();

  const toggleHref = buildNowHref(piece, isSeed, !echoesOpen) + "#echoes";

  return (
    <div className="flex min-h-[100dvh] w-full flex-col">
      <header className="flex items-center justify-between px-6 pt-6">
        <span className="font-sans text-[0.6rem] font-medium uppercase tracking-[0.2em] text-muted/50">
          url-toggle
        </span>
        {isSeed ? (
          <span className="h-1 w-6 rounded-full bg-foreground/20" />
        ) : (
          <Link
            href="/"
            aria-label="Return to today's seed"
            className="h-1 w-6 rounded-full bg-foreground/40 transition hover:bg-accent"
          />
        )}
        <span aria-hidden="true" className="w-[5rem]" />
      </header>

      <main className="flex flex-1 flex-col items-center px-7 py-10 sm:px-10">
        <article
          className={`mx-auto flex w-full max-w-[34rem] flex-col ${
            echoesOpen ? "" : "flex-1 justify-center"
          }`}
        >
          <p
            className={`font-serif font-normal tracking-tight text-foreground ${textSizeClass(piece.text.length)}`}
          >
            {piece.text}
          </p>

          {attribution ? (
            <p className="mt-8 font-sans text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-foreground/70">
              — {attribution}
            </p>
          ) : null}

          {showContext ? (
            <p className="mt-2 font-serif text-[0.95rem] italic text-muted">
              from {context}
            </p>
          ) : null}

          <Link
            href={`/source?type=${encodeURIComponent(piece.originType)}&file=${encodeURIComponent(piece.originFile)}`}
            className="mt-4 inline-flex items-center gap-1.5 font-sans text-[0.68rem] font-medium uppercase tracking-[0.24em] text-muted/70 transition hover:text-accent"
          >
            <span aria-hidden="true">↗</span>
            <span>Source</span>
          </Link>

          {piece.tags.length > 0 ? (
            <ul className="mt-7 flex flex-wrap gap-1.5">
              {piece.tags.slice(0, 6).map((tag) => (
                <li
                  key={tag}
                  className="rounded-full border border-line px-2.5 py-0.5 text-[0.68rem] font-medium uppercase tracking-[0.18em] text-muted"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
        </article>

        {echoesOpen && echoes.length > 0 ? (
          <section
            id="echoes"
            aria-label="Echoes"
            className="mx-auto mt-10 w-full max-w-[34rem] border-t border-line pt-8 scroll-mt-4"
          >
            <h2 className="mb-4 font-sans text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-muted">
              Echoes
            </h2>
            <ul className="flex flex-col gap-3">
              {echoes.map((echo) => (
                <li key={echo.id}>
                  <Link
                    href={`/?p=${encodeURIComponent(echo.id)}`}
                    className="block w-full rounded-[1.25rem] border border-line bg-card/70 px-5 py-4 transition active:scale-[0.99] hover:border-accent/60"
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
        <div className="flex items-center justify-center gap-2">
          {echoes.length > 0 ? (
            <Link
              href={toggleHref}
              aria-expanded={echoesOpen}
              scroll={true}
              prefetch={false}
              className="flex items-center gap-2 rounded-full border border-line bg-card/90 px-5 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-muted shadow-[0_8px_24px_rgba(89,64,34,0.08)] transition active:scale-[0.98]"
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
            <span className="rounded-full border border-line/60 bg-card/60 px-5 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-muted/70">
              No echoes yet
            </span>
          )}

          <Link
            href={`/random?from=${encodeURIComponent(piece.id)}`}
            prefetch={false}
            aria-label="Draw another piece"
            className="flex items-center gap-2 rounded-full border border-line bg-card/90 px-5 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-muted shadow-[0_8px_24px_rgba(89,64,34,0.08)] transition active:scale-[0.98]"
          >
            <span className="text-foreground/80">◈</span>
            <span>Draw</span>
          </Link>
        </div>
      </footer>
    </div>
  );
}

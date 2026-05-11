import Link from "next/link";

import { getLogseqUrl } from "@/lib/logseq";
import type { QuestionRecord } from "@/lib/questions-data";

type QuestionViewProps = {
  question: QuestionRecord;
  remaining: number;
  seen: string[];
};

function textSizeClass(length: number): string {
  if (length < 90) return "text-[2.5rem] leading-[1.08] sm:text-[3rem]";
  if (length < 180) return "text-[2rem] leading-[1.12] sm:text-[2.35rem]";
  if (length < 320) return "text-[1.55rem] leading-[1.2] sm:text-[1.85rem]";
  return "text-[1.25rem] leading-[1.34] sm:text-[1.45rem]";
}

export function QuestionView({ question, remaining, seen }: QuestionViewProps) {
  const logseqUrl = getLogseqUrl(
    question.originType,
    question.originFile,
    question.blockId,
  );
  const nextParams = new URLSearchParams();
  nextParams.set("from", question.id);

  for (const id of seen) {
    nextParams.append("seen", id);
  }

  return (
    <div className="flex min-h-[100dvh] w-full flex-col">
      <header className="flex items-center justify-between px-6 pt-6">
        <Link
          href="/"
          className="font-sans text-[0.6rem] font-medium uppercase tracking-[0.2em] text-muted/50 transition hover:text-accent"
        >
          Zette
        </Link>
        <span aria-hidden="true" className="h-1 w-6 rounded-full bg-foreground/20" />
        <span className="w-[5rem] text-right font-sans text-[0.6rem] font-medium uppercase tracking-[0.2em] text-muted/50">
          Questions
        </span>
      </header>

      <main className="flex flex-1 flex-col items-center px-7 py-10 sm:px-10">
        <article className="mx-auto flex w-full max-w-[34rem] flex-1 flex-col justify-center">
          <p className="mb-5 font-sans text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-accent">
            My Questions
          </p>
          <p
            className={`font-serif font-normal tracking-tight text-foreground ${textSizeClass(
              question.text.length,
            )}`}
          >
            {question.text}
          </p>

          <div className="mt-8 flex flex-col gap-2 text-sm text-muted">
            <p className="font-serif italic">from {question.sourceDisplay}</p>
            {question.sourceLocator ? (
              <p className="font-sans text-[0.68rem] font-medium uppercase tracking-[0.22em] text-muted/55">
                {question.sourceLocator}
              </p>
            ) : null}
          </div>

          <a
            href={logseqUrl}
            className="mt-5 inline-flex items-center gap-1.5 font-sans text-[0.68rem] font-medium uppercase tracking-[0.24em] text-muted/70 transition hover:text-accent"
          >
            <span aria-hidden="true">↗</span>
            <span>Open in Logseq</span>
          </a>

          {question.tags.length > 0 ? (
            <ul className="mt-7 flex flex-wrap gap-1.5">
              {question.tags.slice(0, 6).map((tag) => (
                <li key={tag}>
                  <Link
                    href={`/?tags=${encodeURIComponent(tag)}`}
                    className="block rounded-full border border-line px-2.5 py-0.5 text-[0.68rem] font-medium uppercase tracking-[0.18em] text-muted transition hover:border-accent hover:text-accent"
                  >
                    {tag}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      </main>

      <footer className="sticky bottom-0 w-full pb-6">
        <div className="flex items-center justify-center gap-2 px-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-full border border-line bg-card/90 px-5 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-muted shadow-[0_8px_24px_rgba(89,64,34,0.08)] transition active:scale-[0.98]"
          >
            <span className="text-foreground/80">←</span>
            <span>Cards</span>
          </Link>

          <Link
            href={`/questions/random?${nextParams.toString()}`}
            prefetch={false}
            className="flex items-center gap-2 rounded-full border border-line bg-card/90 px-5 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-muted shadow-[0_8px_24px_rgba(89,64,34,0.08)] transition active:scale-[0.98]"
          >
            <span className="text-foreground/80">?</span>
            <span>Next</span>
            <span className="tabular-nums text-foreground/60">{remaining}</span>
          </Link>
        </div>
      </footer>
    </div>
  );
}

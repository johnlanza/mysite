import { QuotesExplorer } from "@/components/quotes-explorer";
import { RefreshQuotesButton } from "@/components/refresh-quotes-button";
import { readBookNotesDataset } from "@/lib/book-notes-data";
import { readQuotesDataset } from "@/lib/quotes-data";
import Link from "next/link";

export const dynamic = "force-dynamic";

type QuoteRecord = Awaited<ReturnType<typeof readQuotesDataset>>["quotes"][number];

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function getDailyQuote(quotes: QuoteRecord[]) {
  const today = new Date();
  const dateKey = `${today.getUTCFullYear()}-${today.getUTCMonth() + 1}-${today.getUTCDate()}`;
  const index = hashString(dateKey) % quotes.length;
  return quotes[index];
}

export default async function Home() {
  const [{ quotes, tags, stats }, bookNotesDataset] = await Promise.all([
    readQuotesDataset(),
    readBookNotesDataset(),
  ]);
  const dailyQuote = getDailyQuote(quotes);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 py-6 sm:px-8 lg:px-10">
      <section className="mb-6 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[2rem] border border-line bg-card px-6 py-7 shadow-[0_20px_60px_rgba(89,64,34,0.08)] backdrop-blur">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.26em] text-accent">
            Zette
          </p>
          <h1 className="max-w-2xl font-serif text-5xl leading-[0.95] tracking-tight sm:text-6xl">
            A trusted home for the quotes you actually want to revisit.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-muted sm:text-base">
            Built from your Logseq markdown, normalized into a local dataset,
            and organized by the tags you already use.
          </p>
          <div className="mt-5 flex flex-wrap gap-4">
            <RefreshQuotesButton />
            <Link
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent"
              href="/review"
            >
              Review Quotes
            </Link>
            <Link
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent"
              href="/books"
            >
              Browse Book Notes
            </Link>
          </div>
        </div>

        <div className="rounded-[2rem] border border-line bg-[#223127] px-6 py-7 text-[#f8f2e9] shadow-[0_20px_60px_rgba(36,48,40,0.18)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#d7c29a]">
            Today&apos;s quote
          </p>
          <blockquote className="mt-4 font-serif text-2xl leading-tight sm:text-[2rem]">
            &ldquo;{dailyQuote.text}&rdquo;
          </blockquote>
          <p className="mt-5 text-sm font-semibold tracking-[0.16em] uppercase text-[#d7c29a]">
            {dailyQuote.author ?? "Unknown"}
          </p>
          <p className="mt-1 text-sm text-[#dfd5c8]">
            <Link
              className="underline decoration-transparent underline-offset-4 transition hover:decoration-current"
              href={`/source?type=${encodeURIComponent(dailyQuote.originType)}&file=${encodeURIComponent(dailyQuote.originFile)}`}
            >
              {dailyQuote.sourceDisplay}
            </Link>
          </p>
        </div>
      </section>

      <section className="mb-6 grid gap-3 rounded-[2rem] border border-line bg-card/80 px-5 py-5 sm:grid-cols-2 lg:grid-cols-6 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Quotes
          </p>
          <p className="mt-2 text-3xl font-semibold">{stats.totalQuotes}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Tagged
          </p>
          <p className="mt-2 text-3xl font-semibold">{stats.taggedQuotes}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Categories
          </p>
          <p className="mt-2 text-3xl font-semibold">{tags.length}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Book Notes
          </p>
          <p className="mt-2 text-3xl font-semibold">{bookNotesDataset.stats.totalNotes}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            Suspicious
          </p>
          <p className="mt-2 text-3xl font-semibold">{stats.suspiciousQuotes}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
            New
          </p>
          <p className="mt-2 text-3xl font-semibold">{stats.newQuotes}</p>
        </div>
      </section>

      <QuotesExplorer quotes={quotes} tags={tags} />
    </main>
  );
}

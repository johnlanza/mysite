import Link from "next/link";

import { RefreshQuotesButton } from "@/components/refresh-quotes-button";
import { readQuotesDataset } from "@/lib/quotes-data";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const dataset = await readQuotesDataset();
  const newQuotes = dataset.quotes.filter((quote) => quote.review.isNew);
  const flaggedQuotes = dataset.quotes.filter((quote) => quote.review.flags.length > 0);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 py-6 sm:px-8 lg:px-10">
      <section className="rounded-[2rem] border border-line bg-card px-6 py-6 shadow-[0_20px_60px_rgba(89,64,34,0.08)]">
        <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
              Review
            </p>
            <h1 className="mt-2 font-serif text-4xl tracking-tight">
              New and suspicious quotes
            </h1>
            <p className="mt-2 text-sm text-muted">
              Last dataset refresh: {new Date(dataset.generatedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <RefreshQuotesButton />
            <Link
              className="text-sm text-muted underline decoration-transparent underline-offset-4 transition hover:decoration-current hover:text-accent"
              href="/library"
            >
              Back to library
            </Link>
          </div>
        </div>

        <section className="mt-6">
          <h2 className="font-serif text-3xl">New quotes</h2>
          <p className="mt-2 text-sm text-muted">{newQuotes.length} records</p>
          <div className="mt-4 space-y-4">
            {newQuotes.length === 0 ? (
              <p className="text-sm text-muted">No newly added quotes since the previous dataset.</p>
            ) : (
              newQuotes.map((quote) => (
                <article
                  key={`new-${quote.id}`}
                  className="rounded-[1.5rem] border border-line bg-[#fffaf2] px-5 py-5"
                >
                  <blockquote className="font-serif text-2xl leading-tight">
                    &ldquo;{quote.text}&rdquo;
                  </blockquote>
                  <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-accent">
                    {quote.author ?? "Unknown"}
                  </p>
                  <p className="mt-1 text-sm text-muted">{quote.sourceDisplay}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="font-serif text-3xl">Suspicious quotes</h2>
          <p className="mt-2 text-sm text-muted">{flaggedQuotes.length} records</p>
          <div className="mt-4 space-y-4">
            {flaggedQuotes.length === 0 ? (
              <p className="text-sm text-muted">No suspicious records were flagged.</p>
            ) : (
              flaggedQuotes.map((quote) => (
                <article
                  key={`flagged-${quote.id}`}
                  className="rounded-[1.5rem] border border-line bg-[#fffaf2] px-5 py-5"
                >
                  <blockquote className="font-serif text-2xl leading-tight">
                    &ldquo;{quote.text}&rdquo;
                  </blockquote>
                  <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-accent">
                    {quote.author ?? "Unknown"}
                  </p>
                  <p className="mt-1 text-sm text-muted">{quote.sourceDisplay}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {quote.review.flags.map((flag) => (
                      <span
                        key={`${quote.id}-${flag}`}
                        className="rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-accent"
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

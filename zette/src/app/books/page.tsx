import Link from "next/link";

import { BookNotesExplorer } from "@/components/book-notes-explorer";
import { RefreshQuotesButton } from "@/components/refresh-quotes-button";
import { readBookNotesDataset } from "@/lib/book-notes-data";

export const dynamic = "force-dynamic";

export default async function BooksPage() {
  const dataset = await readBookNotesDataset();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 py-6 sm:px-8 lg:px-10">
      <section className="mb-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-line bg-card px-6 py-7 shadow-[0_20px_60px_rgba(89,64,34,0.08)] backdrop-blur">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.26em] text-accent">
            Zette
          </p>
          <h1 className="max-w-2xl font-serif text-5xl leading-[0.95] tracking-tight sm:text-6xl">
            Tagged notes from the books you actually revisit.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-muted sm:text-base">
            Pulled from book pages in your Logseq graph, with the book title and
            author preserved so every note stays attributable and traceable.
          </p>
          <div className="mt-5 flex flex-wrap gap-4">
            <RefreshQuotesButton />
            <Link
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent"
              href="/library"
            >
              Back to library
            </Link>
          </div>
        </div>

        <div className="rounded-[2rem] border border-line bg-[#223127] px-6 py-7 text-[#f8f2e9] shadow-[0_20px_60px_rgba(36,48,40,0.18)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#d7c29a]">
            Book notes
          </p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-[#d7c29a]">Notes</dt>
              <dd className="mt-2 text-3xl font-semibold">{dataset.stats.totalNotes}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-[#d7c29a]">Books</dt>
              <dd className="mt-2 text-3xl font-semibold">{dataset.stats.books}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-[#d7c29a]">Tags</dt>
              <dd className="mt-2 text-3xl font-semibold">{dataset.tags.length}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-[#d7c29a]">New</dt>
              <dd className="mt-2 text-3xl font-semibold">{dataset.stats.newNotes}</dd>
            </div>
          </dl>
        </div>
      </section>

      <BookNotesExplorer notes={dataset.notes} tags={dataset.tags} />
    </main>
  );
}

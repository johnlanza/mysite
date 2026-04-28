"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { BookNoteRecord } from "@/lib/book-notes-data";

type BookNotesExplorerProps = {
  notes: BookNoteRecord[];
  tags: string[];
};

export function BookNotesExplorer({ notes, tags }: BookNotesExplorerProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredNotes = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return notes.filter((note) => {
      const matchesTags =
        selectedTags.length === 0 || selectedTags.every((tag) => note.tags.includes(tag));

      if (!matchesTags) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [note.text, note.bookTitle, note.bookAuthor, note.sourceDisplay]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [notes, searchQuery, selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((value) => value !== tag)
        : [...current, tag],
    );
  };

  return (
    <section className="grid w-full gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="w-full rounded-[2rem] border border-line bg-card px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
              Filters
            </p>
            <h2 className="mt-2 font-serif text-3xl">Categories</h2>
          </div>
          {selectedTags.length > 0 ? (
            <button
              className="rounded-full border border-line px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted transition hover:border-accent hover:text-accent"
              onClick={() => setSelectedTags([])}
              suppressHydrationWarning
              type="button"
            >
              Clear
            </button>
          ) : null}
        </div>

        <p className="mt-3 text-sm leading-6 text-muted">
          Filter book notes by one or more categories. Multiple selections use
          an AND filter.
        </p>

        <div className="capsule-scrollbar mt-5 flex flex-wrap gap-2 overflow-x-auto pb-1">
          {tags.map((tag) => {
            const active = selectedTags.includes(tag);

            return (
              <button
                key={tag}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  active
                    ? "border-accent bg-accent text-[#f8f2e9]"
                    : "border-transparent bg-chip text-foreground hover:border-line"
                }`}
                onClick={() => toggleTag(tag)}
                suppressHydrationWarning
                type="button"
              >
                #{tag}
              </button>
            );
          })}
        </div>
      </aside>

      <div className="min-w-0 w-full rounded-[2rem] border border-line bg-card px-6 py-5">
        <div className="flex flex-col gap-2 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
              Library
            </p>
            <h2 className="mt-2 font-serif text-3xl">Book Notes</h2>
          </div>
          <p className="text-sm text-muted">
            {filteredNotes.length} of {notes.length} notes
          </p>
        </div>

        <div className="mt-5">
          <label className="sr-only" htmlFor="book-note-search">
            Search book notes
          </label>
          <input
            id="book-note-search"
            className="w-full rounded-[1.25rem] border border-line bg-[#fffaf2] px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search note text, book title, or author"
            suppressHydrationWarning
            type="search"
            value={searchQuery}
          />
        </div>

        <div className="mt-5 space-y-4">
          {filteredNotes.map((note) => (
            <article
              key={note.id}
              className="rounded-[1.5rem] border border-line bg-[#fffaf2] px-5 py-5 shadow-[0_8px_30px_rgba(73,56,35,0.05)]"
            >
              <p className="font-serif text-2xl leading-tight text-foreground">
                {note.text}
              </p>

              <div className="mt-5 flex flex-col gap-1 text-sm text-muted">
                <p className="font-semibold uppercase tracking-[0.16em] text-accent">
                  {note.bookAuthor}
                </p>
                <p>
                  <Link
                    className="underline decoration-transparent underline-offset-4 transition hover:decoration-current hover:text-accent"
                    href={`/source?type=${encodeURIComponent(note.originType)}&file=${encodeURIComponent(note.originFile)}`}
                  >
                    {note.bookTitle}
                  </Link>
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {note.tags.map((tag) => (
                  <button
                    key={`${note.id}-${tag}`}
                    className="rounded-full bg-chip px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted transition hover:bg-accent-soft hover:text-accent"
                    onClick={() => toggleTag(tag)}
                    suppressHydrationWarning
                    type="button"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

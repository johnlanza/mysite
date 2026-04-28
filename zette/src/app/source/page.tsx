import fs from "node:fs/promises";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getSourcePath } from "@/lib/source-paths";

type SourcePageProps = {
  searchParams: Promise<{
    file?: string;
    type?: string;
  }>;
};

export default async function SourcePage({ searchParams }: SourcePageProps) {
  const params = await searchParams;
  const originFile = params.file;
  const originType = params.type;

  if (!originFile || !originType) {
    notFound();
  }

  const sourcePath = getSourcePath(originType, originFile);

  if (!sourcePath) {
    notFound();
  }

  let content: string | null = null;

  try {
    content = await fs.readFile(sourcePath, "utf8");
  } catch {
    content = null;
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-6 sm:px-8 lg:px-10">
      <div className="rounded-[2rem] border border-line bg-card px-6 py-6 shadow-[0_20px_60px_rgba(89,64,34,0.08)]">
        <div className="flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
              Source
            </p>
            <h1 className="mt-2 font-serif text-4xl tracking-tight">
              {decodeURIComponent(originFile.replace(/\.md$/i, ""))}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {content ? sourcePath : "Local Logseq source file unavailable in this environment."}
            </p>
          </div>
          <Link
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent"
            href="/library"
          >
            Back to library
          </Link>
        </div>

        {content ? (
          <pre className="mt-5 overflow-x-auto rounded-[1.5rem] border border-line bg-[#fffaf2] p-5 text-sm leading-7 whitespace-pre-wrap text-foreground">
            {content}
          </pre>
        ) : (
          <div className="mt-5 rounded-[1.5rem] border border-line bg-[#fffaf2] p-5 text-sm leading-7 text-muted">
            This source link points to the original Logseq markdown on the local
            machine. The live site can still show the extracted quote or note,
            but it cannot read the private source file.
          </div>
        )}
      </div>
    </main>
  );
}

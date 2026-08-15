"use client";

import { useState } from "react";

import { withBasePath } from "@/lib/base-path";

type RefreshQuotesButtonProps = {
  compact?: boolean;
};

type SyncDatasetStatus = {
  count: number;
  generatedAt: string | null;
};

type SyncStatusPayload = {
  generatedAt: string | null;
  datasets: {
    quotes: SyncDatasetStatus;
    bookNotes: SyncDatasetStatus;
    questions: SyncDatasetStatus;
    brain: SyncDatasetStatus;
    embeddings: SyncDatasetStatus;
  };
};

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "No sync found";
  }

  return new Date(value).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function RefreshQuotesButton({
  compact = false,
}: RefreshQuotesButtonProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const disabled = isRefreshing;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setStatus("Checking Zette...");

    try {
      const response = await fetch(withBasePath("/api/refresh-quotes"), {
        cache: "no-store",
        method: "GET",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        const error = payload?.error ? `: ${payload.error}` : ".";

        setStatus(`Status check failed${error}`);
        return;
      }

      const payload = (await response.json()) as SyncStatusPayload;
      const counts = payload.datasets;

      setStatus(
        `Updated ${formatUpdatedAt(payload.generatedAt)} · ${counts.quotes.count.toLocaleString()} quotes · ${counts.bookNotes.count.toLocaleString()} notes · ${counts.questions.count.toLocaleString()} questions · ${counts.brain.count.toLocaleString()} brain records`,
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className={`flex flex-col ${compact ? "items-end" : "items-start"} gap-2`}>
      <button
        className={`rounded-full border border-line font-semibold text-muted transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60 ${
          compact
            ? "px-3 py-1.5 text-[0.68rem] uppercase tracking-[0.2em]"
            : "px-4 py-2 text-sm"
        }`}
        disabled={disabled}
        onClick={handleRefresh}
        suppressHydrationWarning
        type="button"
      >
        {disabled ? "Checking..." : compact ? "Sync" : "Sync Zette"}
      </button>
      {status ? (
        <p
          aria-live="polite"
          className={`text-muted ${
            compact
              ? "max-w-[14rem] text-right text-[0.62rem] leading-4"
              : "text-xs"
          }`}
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}

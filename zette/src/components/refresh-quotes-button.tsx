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

type SmartLayerStatus = {
  generatedAt: string | null;
  isCurrent: boolean;
  totalPieces: number;
  pendingPieces: number;
  removedPieces: number;
  estimatedPendingCostUsd: number;
  staleDueToModelChange: boolean;
  topPendingSources?: Array<{ label: string; count: number }>;
};

type SyncStatusPayload = {
  generatedAt: string | null;
  smart?: SmartLayerStatus;
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

function formatCost(value: number) {
  if (!value || value <= 0) {
    return "$0.00";
  }

  if (value < 0.01) {
    return "<$0.01";
  }

  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function buildStatusMessage(payload: SyncStatusPayload) {
  const counts = payload.datasets;
  const smart = payload.smart;

  if (!smart) {
    return `Updated ${formatUpdatedAt(payload.generatedAt)} · ${counts.quotes.count.toLocaleString()} quotes · ${counts.bookNotes.count.toLocaleString()} notes · ${counts.questions.count.toLocaleString()} questions · ${counts.brain.count.toLocaleString()} brain records`;
  }

  const latestData = formatUpdatedAt(payload.generatedAt);
  const lastSmartPass = formatUpdatedAt(smart.generatedAt);

  if (smart.staleDueToModelChange) {
    return `Data ${latestData} · smart model changed · ${smart.totalPieces.toLocaleString()} pieces pending`;
  }

  if (smart.pendingPieces > 0 || smart.removedPieces > 0) {
    const pendingText =
      smart.pendingPieces > 0
        ? `${smart.pendingPieces.toLocaleString()} pending`
        : "prune pending";
    const topSource = smart.topPendingSources?.[0];
    const topSourceText = topSource ? ` · top ${topSource.label}` : "";

    return `Data ${latestData} · last smart pass ${lastSmartPass} · ${pendingText}${topSourceText} · est. ${formatCost(smart.estimatedPendingCostUsd)}`;
  }

  return `Updated ${latestData} · smart layer current · ${smart.totalPieces.toLocaleString()} pieces`;
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

      setStatus(buildStatusMessage(payload));
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
              ? "max-w-[18rem] text-right text-[0.62rem] leading-4"
              : "text-xs"
          }`}
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}

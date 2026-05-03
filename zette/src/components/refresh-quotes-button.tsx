"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { withBasePath } from "@/lib/base-path";

type RefreshQuotesButtonProps = {
  compact?: boolean;
};

export function RefreshQuotesButton({
  compact = false,
}: RefreshQuotesButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const disabled = isRefreshing || isPending;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setStatus("Syncing Zette...");

    try {
      const response = await fetch(withBasePath("/api/refresh-quotes"), {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; script?: string }
          | null;
        const script = payload?.script ? ` (${payload.script})` : "";
        const error = payload?.error ? `: ${payload.error}` : ".";

        setStatus(`Refresh failed${script}${error}`);
        return;
      }

      const payload = (await response.json()) as { generatedAt: string };

      startTransition(() => {
        router.refresh();
      });

      setStatus(`Updated ${new Date(payload.generatedAt).toLocaleString()}`);
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
        {disabled ? "Syncing..." : compact ? "Sync" : "Sync Zette"}
      </button>
      {status && !compact ? <p className="text-xs text-muted">{status}</p> : null}
    </div>
  );
}

#!/usr/bin/env node
import {
  formatEstimatedCost,
  getEmbeddingPlan,
  summarizeEmbeddingPlan,
} from "./embedding-utils.mjs";

function formatDate(value) {
  if (!value) return "No smart pass found";

  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

async function main() {
  const json = process.argv.includes("--json");
  const plan = await getEmbeddingPlan();
  const summary = summarizeEmbeddingPlan(plan);

  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`Smart layer: ${summary.isCurrent ? "current" : "stale"}`);
  console.log(`Last smart pass: ${formatDate(summary.generatedAt)}`);
  console.log(`Embeddable pieces: ${summary.totalPieces.toLocaleString()}`);
  console.log(`Cached pieces: ${summary.cachedPieces.toLocaleString()}`);
  console.log(
    `Pending smart updates: ${pluralize(summary.pendingPieces, "piece")}`,
  );

  if (summary.pendingPieces > 0) {
    console.log(
      `Estimated embedding input: ${summary.estimatedPendingTokens.toLocaleString()} tokens, ${formatEstimatedCost(
        summary.estimatedPendingCostUsd,
      )}`,
    );
    console.log(
      [
        "Pending by source:",
        `quotes ${summary.byKind.quote.pendingPieces.toLocaleString()}`,
        `notes ${summary.byKind.note.pendingPieces.toLocaleString()}`,
        `questions ${summary.byKind.question.pendingPieces.toLocaleString()}`,
        `brain ${summary.byKind.brain.pendingPieces.toLocaleString()}`,
      ].join(" "),
    );

    if (summary.topPendingSources.length > 0) {
      console.log(
        `Top pending sources: ${summary.topPendingSources
          .map((source) => `${source.label} ${source.count.toLocaleString()}`)
          .join("; ")}`,
      );
    }
  }

  if (summary.removedPieces > 0) {
    console.log(
      `Obsolete vectors to prune: ${pluralize(summary.removedPieces, "piece")}`,
    );
  }

  if (summary.staleDueToModelChange) {
    console.log("Model or dimensions changed; a full smart pass is required.");
  }
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});

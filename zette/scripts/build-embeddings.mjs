#!/usr/bin/env node
import fs from "node:fs/promises";

import {
  DIMENSIONS,
  EMBEDDINGS_FILE,
  MODEL,
  getEmbeddingPlan,
  summarizeEmbeddingPlan,
} from "./embedding-utils.mjs";

const BATCH_SIZE = 96;

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

async function embedBatch(inputs, apiKey) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: inputs,
      dimensions: DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${body}`);
  }

  const json = await res.json();
  return json.data.map((d) => d.embedding);
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) die("OPENAI_API_KEY is not set");

  const plan = await getEmbeddingPlan();
  const summary = summarizeEmbeddingPlan(plan);
  const { entries, toEmbed } = plan;

  console.log(
    `Pieces: ${summary.totalPieces} · cached: ${summary.cachedPieces} · to embed: ${summary.pendingPieces}`,
  );

  if (toEmbed.length === 0) {
    console.log("Nothing to embed. Skipping API call.");
  } else {
    for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
      const batch = toEmbed.slice(i, i + BATCH_SIZE);
      const inputs = batch.map((b) => b.input);
      process.stdout.write(
        `  batch ${i / BATCH_SIZE + 1}/${Math.ceil(toEmbed.length / BATCH_SIZE)} (${batch.length}) ... `,
      );
      const vectors = await embedBatch(inputs, apiKey);
      for (let j = 0; j < batch.length; j += 1) {
        entries[batch[j].id] = {
          textHash: batch[j].textHash,
          vector: vectors[j],
        };
      }
      console.log("done");
    }
  }

  const output = {
    model: MODEL,
    dimensions: DIMENSIONS,
    generatedAt: new Date().toISOString(),
    entries,
  };

  await fs.writeFile(EMBEDDINGS_FILE, JSON.stringify(output), "utf8");
  console.log(`✓ Wrote ${EMBEDDINGS_FILE} · ${Object.keys(entries).length} entries`);
}

main().catch((err) => die(err.message || String(err)));

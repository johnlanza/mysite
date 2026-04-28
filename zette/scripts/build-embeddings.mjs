#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const QUOTES_FILE = path.join(ROOT, "src/data/quotes.json");
const BOOK_NOTES_FILE = path.join(ROOT, "src/data/book-notes.json");
const EMBEDDINGS_FILE = path.join(ROOT, "src/data/embeddings.json");

const MODEL = "text-embedding-3-small";
const DIMENSIONS = 512;
const BATCH_SIZE = 96;

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function hashText(text) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);
}

function buildEmbeddingInput(piece) {
  const parts = [piece.text];
  if (piece.note) parts.push(`my note: ${piece.note}`);
  if (piece.attribution) parts.push(`— ${piece.attribution}`);
  if (piece.context && piece.context !== piece.attribution) {
    parts.push(`from ${piece.context}`);
  }
  if (piece.tags && piece.tags.length > 0) {
    parts.push(`tags: ${piece.tags.join(", ")}`);
  }
  return parts.join("\n");
}

function unifyQuote(q) {
  return {
    id: `q:${q.id}`,
    text: q.text,
    note: q.note,
    attribution: q.author,
    context: q.source,
    tags: q.tags ?? [],
  };
}

function unifyNote(n) {
  return {
    id: `n:${n.id}`,
    text: n.text,
    note: n.note,
    attribution: n.bookAuthor || null,
    context: n.bookTitle || null,
    tags: n.tags ?? [],
  };
}

async function readJson(filePath, fallback = null) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (err) {
    if (err.code === "ENOENT" && fallback !== null) return fallback;
    throw err;
  }
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

  const quotesDataset = await readJson(QUOTES_FILE);
  const notesDataset = await readJson(BOOK_NOTES_FILE);
  if (!quotesDataset) die(`Missing ${QUOTES_FILE}`);
  if (!notesDataset) die(`Missing ${BOOK_NOTES_FILE}`);

  const pieces = [
    ...quotesDataset.quotes.map(unifyQuote),
    ...notesDataset.notes.map(unifyNote),
  ];

  const existing = await readJson(EMBEDDINGS_FILE, {
    model: MODEL,
    dimensions: DIMENSIONS,
    generatedAt: null,
    entries: {},
  });

  const modelChanged =
    existing.model !== MODEL || existing.dimensions !== DIMENSIONS;
  const entries = modelChanged ? {} : { ...existing.entries };

  const toEmbed = [];
  for (const piece of pieces) {
    const input = buildEmbeddingInput(piece);
    const textHash = hashText(input);
    const prior = entries[piece.id];
    if (prior && prior.textHash === textHash) continue;
    toEmbed.push({ id: piece.id, input, textHash });
  }

  const validIds = new Set(pieces.map((p) => p.id));
  for (const id of Object.keys(entries)) {
    if (!validIds.has(id)) delete entries[id];
  }

  console.log(
    `Pieces: ${pieces.length} · cached: ${pieces.length - toEmbed.length} · to embed: ${toEmbed.length}`,
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

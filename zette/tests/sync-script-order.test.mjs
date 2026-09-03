import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const syncScript = fs.readFileSync(
  path.join(repoRoot, "scripts/sync-zette.sh"),
  "utf8",
);

test("content publish path rebuilds brain data before embeddings", () => {
  const questionsIndex = syncScript.indexOf("npm --prefix zette run questions:build");
  const brainIndex = syncScript.indexOf("npm --prefix zette run brain:build");
  const embeddingsIndex = syncScript.indexOf("npm --prefix zette run embeddings:build");
  const buildIndex = syncScript.indexOf("npm run build");

  assert.ok(questionsIndex >= 0, "questions build step is missing");
  assert.ok(brainIndex >= 0, "brain build step is missing");
  assert.ok(embeddingsIndex >= 0, "embeddings build step is missing");
  assert.ok(buildIndex >= 0, "site build step is missing");
  assert.ok(questionsIndex < brainIndex, "brain build should follow curated datasets");
  assert.ok(brainIndex < embeddingsIndex, "brain build should precede embeddings");
  assert.ok(embeddingsIndex < buildIndex, "embeddings should be ready before build");
});

test("content publish path stages brain dataset inputs and output", () => {
  for (const expectedPath of [
    "zette/scripts/build-brain-dataset.mjs",
    "zette/src/lib/brain-data.ts",
    "zette/src/data/brain.json",
    "zette/src/data/embeddings.json",
  ]) {
    assert.ok(
      syncScript.includes(expectedPath),
      `${expectedPath} should be staged by the sync script`,
    );
  }
});

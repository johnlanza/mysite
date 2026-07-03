#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY is required so Zette Echoes embeddings stay current." >&2
  echo "Set it in the environment before running sync." >&2
  exit 1
fi

npm --prefix zette run quotes:build
npm --prefix zette run books:build
npm --prefix zette run questions:build
npm --prefix zette run embeddings:build
npm run build

git add \
  AGENTS.md \
  scripts/sync-zette.sh \
  scripts/sync-zette-questions.sh \
  zette/AGENTS.md \
  zette/scripts/build-embeddings.mjs \
  zette/src/lib/echoes.ts \
  zette/src/data/book-notes.json \
  zette/src/data/embeddings.json \
  zette/src/data/questions.json \
  zette/src/data/quotes.json

if git diff --cached --quiet; then
  echo "No Zette changes to publish."
  exit 0
fi

git commit -m "Refresh Zette echoes and sync"
git push origin main

#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

npm --prefix zette run questions:build
npm run build

git add package.json scripts/sync-zette-questions.sh zette/src/data/questions.json

if git diff --cached --quiet; then
  echo "No Zette question changes to publish."
  exit 0
fi

git commit -m "Refresh Zette questions"
git push origin main

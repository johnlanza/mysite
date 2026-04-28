import fs from "node:fs";
import { spawn } from "node:child_process";

const DIRECTORIES = [
  "/Users/johnlanza/Library/Mobile Documents/iCloud~com~logseq~logseq/Documents/journals",
  "/Users/johnlanza/Library/Mobile Documents/iCloud~com~logseq~logseq/Documents/pages",
];

let timeoutId = null;
let running = false;
let queued = false;

function runBuild() {
  if (running) {
    queued = true;
    return;
  }

  running = true;
  console.log(`[quotes:watch] rebuilding library at ${new Date().toLocaleTimeString()}`);

  const child = spawn(process.execPath, [
    "/Users/johnlanza/Dev/zette/scripts/build-quotes-dataset.mjs",
  ], {
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      running = false;

      if (queued) {
        queued = false;
        runBuild();
      }

      return;
    }

    const booksChild = spawn(process.execPath, [
      "/Users/johnlanza/Dev/zette/scripts/build-book-notes-dataset.mjs",
    ], {
      stdio: "inherit",
    });

    booksChild.on("exit", () => {
      running = false;

      if (queued) {
        queued = false;
        runBuild();
      }
    });
  });
}

function scheduleBuild() {
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  timeoutId = setTimeout(() => {
    timeoutId = null;
    runBuild();
  }, 800);
}

for (const directory of DIRECTORIES) {
  fs.watch(directory, { recursive: true }, (_eventType, fileName) => {
    if (!fileName || !fileName.endsWith(".md")) {
      return;
    }

    scheduleBuild();
  });
}

console.log("[quotes:watch] watching Logseq markdown for quote and book-note changes...");

import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const DIRECTORIES = [
  "/Users/johnlanza/Library/Mobile Documents/iCloud~com~logseq~logseq/Documents/journals",
  "/Users/johnlanza/Library/Mobile Documents/iCloud~com~logseq~logseq/Documents/pages",
];
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BUILD_SCRIPTS = [
  "build-quotes-dataset.mjs",
  "build-book-notes-dataset.mjs",
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
  runScript(0);
}

function finishBuild() {
  running = false;

  if (queued) {
    queued = false;
    runBuild();
  }
}

function runScript(scriptIndex) {
  const scriptName = BUILD_SCRIPTS[scriptIndex];
  const child = spawn(process.execPath, [path.join(ROOT, "scripts", scriptName)], {
    cwd: ROOT,
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      finishBuild();
      return;
    }

    if (scriptIndex < BUILD_SCRIPTS.length - 1) {
      runScript(scriptIndex + 1);
      return;
    }

    finishBuild();
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

#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const requireFromPoolarama = createRequire(new URL("../poolarama/package.json", import.meta.url));
const { chromium } = requireFromPoolarama("playwright");

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...valueParts] = arg.replace(/^--/, "").split("=");
  args.set(key, valueParts.join("=") || "true");
}

const baseUrl = (args.get("base-url") || process.env.POOLARAMA_BASE_URL || "https://www.johnlanza.com/poolarama").replace(/\/+$/, "");
const screenshotDir = args.get("screenshot-dir") || process.env.POOLARAMA_SCREENSHOT_DIR || ".poolarama-backups";
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

await fs.mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true
});
const consoleErrors = [];
const badResponses = [];

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 400) {
    badResponses.push({ status: response.status(), url: response.url() });
  }
});

const response = await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector("text=Poolarama", { timeout: 30000 });

const bodyText = await page.locator("body").innerText({ timeout: 30000 });
const normalizedText = bodyText.toLowerCase();
const screenshotFile = path.join(
  screenshotDir,
  `poolarama-visual-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}.png`
);
await page.screenshot({ path: screenshotFile, fullPage: true });
await browser.close();

assert(response?.status() === 200, `page status ${response?.status()}`);
assert(normalizedText.includes("poolarama"), "Poolarama logo/name was not visible");
assert(normalizedText.includes("men's world cup 2026 edition"), "edition label was not visible");
assert(normalizedText.includes("players"), "player count card was not visible");
assert(normalizedText.includes("picks"), "Picks tab was not visible");
assert(normalizedText.includes("standings"), "Standings tab was not visible");
assert(normalizedText.includes("rules"), "Rules tab was not visible");
assert(badResponses.length === 0, `bad browser responses: ${JSON.stringify(badResponses)}`);
assert(consoleErrors.length === 0, `browser console errors: ${JSON.stringify(consoleErrors)}`);

const result = {
  ok: failures.length === 0,
  baseUrl,
  screenshotFile,
  badResponses,
  consoleErrors
};

if (failures.length > 0) {
  console.error("Poolarama visual smoke test failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));

#!/usr/bin/env node

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...valueParts] = arg.replace(/^--/, "").split("=");
  args.set(key, valueParts.join("=") || "true");
}

const baseUrl = (args.get("base-url") || process.env.POOLARAMA_BASE_URL || "https://www.johnlanza.com/poolarama").replace(/\/+$/, "");
const adminToken = args.get("admin-token") || process.env.POOLARAMA_ADMIN_TOKEN || "";

if (!adminToken) {
  console.error("Missing Poolarama admin token.");
  console.error("Use --admin-token=... or set POOLARAMA_ADMIN_TOKEN.");
  process.exit(1);
}

async function requestJson(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { response, data };
}

function adminHeaders() {
  return { "x-poolarama-admin": adminToken };
}

function nextActionFor(status, scoredR32Matches) {
  if (status === "setup") {
    return scoredR32Matches === 16
      ? "Generate R16 preview, review 8 matchups, then confirm and open."
      : "Finish scoring all 16 R32 matches before generating R16 preview.";
  }
  if (status === "open") return "Collect R16 picks; lock only after all expected submissions are in.";
  if (status === "locked") return "R16 picks are closed; use admin scoring as real R16 results arrive.";
  return "Check admin state before changing R16.";
}

const [adminR32, adminR16, publicR16, health] = await Promise.all([
  requestJson("/api/admin/r32", { headers: adminHeaders() }),
  requestJson("/api/admin/r16", { headers: adminHeaders() }),
  requestJson("/api/r16"),
  requestJson("/api/admin/health", { headers: adminHeaders() })
]);

const failures = [];
if (adminR32.response.status !== 200) failures.push(`admin r32 status ${adminR32.response.status}`);
if (adminR16.response.status !== 200) failures.push(`admin r16 status ${adminR16.response.status}`);
if (publicR16.response.status !== 200) failures.push(`public r16 status ${publicR16.response.status}`);
if (health.response.status !== 200) failures.push(`health status ${health.response.status}`);

const r32Matches = adminR32.data?.matches || [];
const r16Matches = adminR16.data?.matches || [];
const r16Status = adminR16.data?.pool?.r16?.status || "unknown";
const scoredR32Matches = r32Matches.filter((match) => Boolean(match.winner)).length;
const scoredR16Matches = r16Matches.filter((match) => Boolean(match.winner)).length;

const result = {
  ok: failures.length === 0,
  baseUrl,
  storageMode: adminR16.data?.storageMode || health.data?.storageMode || "unknown",
  pool: {
    r32Status: adminR32.data?.pool?.r32?.status || "unknown",
    r16Status,
    r16OpenedAt: adminR16.data?.pool?.r16?.openedAt || null,
    r16LockedAt: adminR16.data?.pool?.r16?.lockedAt || null
  },
  counts: {
    participants: health.data?.counts?.participants ?? null,
    adminR32Matches: r32Matches.length,
    scoredR32Matches,
    adminR16Matches: r16Matches.length,
    publicR16Matches: publicR16.data?.matches?.length ?? null,
    scoredR16Matches
  },
  nextAction: nextActionFor(r16Status, scoredR32Matches)
};

if (failures.length > 0) {
  result.failures = failures;
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));

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

function nextActionFor(r16Status, scoredR32Matches, qfStatus, scoredR16Matches, sfStatus, scoredQfMatches) {
  if (sfStatus === "open") return "Collect SF picks; lock only after all expected submissions are in.";
  if (sfStatus === "locked") return "SF picks are closed; use admin scoring as real SF results arrive.";

  if (qfStatus === "open") return "Collect QF picks; lock only after all expected submissions are in.";
  if (qfStatus === "locked") {
    return scoredQfMatches === 4
      ? "Generate SF preview, review 2 matchups, then confirm and open."
      : "QF picks are closed; use admin scoring as real QF results arrive.";
  }

  if (r16Status === "setup") {
    return scoredR32Matches === 16
      ? "Generate R16 preview, review 8 matchups, then confirm and open."
      : "Finish scoring all 16 R32 matches before generating R16 preview.";
  }
  if (r16Status === "open") return "Collect R16 picks; lock only after all expected submissions are in.";
  if (r16Status === "locked") {
    return scoredR16Matches === 8
      ? "Generate QF preview, review 4 matchups, then confirm and open."
      : "R16 picks are closed; use admin scoring as real R16 results arrive.";
  }
  return "Check admin state before changing R16.";
}

const [adminR32, adminR16, adminQf, adminSf, publicR16, publicSf, health] = await Promise.all([
  requestJson("/api/admin/r32", { headers: adminHeaders() }),
  requestJson("/api/admin/r16", { headers: adminHeaders() }),
  requestJson("/api/admin/qf", { headers: adminHeaders() }),
  requestJson("/api/admin/sf", { headers: adminHeaders() }),
  requestJson("/api/r16"),
  requestJson("/api/sf"),
  requestJson("/api/admin/health", { headers: adminHeaders() })
]);

const failures = [];
if (adminR32.response.status !== 200) failures.push(`admin r32 status ${adminR32.response.status}`);
if (adminR16.response.status !== 200) failures.push(`admin r16 status ${adminR16.response.status}`);
if (adminQf.response.status !== 200) failures.push(`admin qf status ${adminQf.response.status}`);
if (adminSf.response.status !== 200) failures.push(`admin sf status ${adminSf.response.status}`);
if (publicR16.response.status !== 200) failures.push(`public r16 status ${publicR16.response.status}`);
if (publicSf.response.status !== 200) failures.push(`public sf status ${publicSf.response.status}`);
if (health.response.status !== 200) failures.push(`health status ${health.response.status}`);

const r32Matches = adminR32.data?.matches || [];
const r16Matches = adminR16.data?.matches || [];
const qfMatches = adminQf.data?.matches || [];
const sfMatches = adminSf.data?.matches || [];
const r16Status = adminR16.data?.pool?.r16?.status || "unknown";
const qfStatus = adminQf.data?.pool?.qf?.status || "unknown";
const sfStatus = adminSf.data?.pool?.sf?.status || "unknown";
const scoredR32Matches = r32Matches.filter((match) => Boolean(match.winner)).length;
const scoredR16Matches = r16Matches.filter((match) => Boolean(match.winner)).length;
const scoredQfMatches = qfMatches.filter((match) => Boolean(match.winner)).length;
const scoredSfMatches = sfMatches.filter((match) => Boolean(match.winner)).length;

const result = {
  ok: failures.length === 0,
  baseUrl,
  storageMode: adminQf.data?.storageMode || adminR16.data?.storageMode || health.data?.storageMode || "unknown",
  pool: {
    r32Status: adminR32.data?.pool?.r32?.status || "unknown",
    r16Status,
    r16OpenedAt: adminR16.data?.pool?.r16?.openedAt || null,
    r16LockedAt: adminR16.data?.pool?.r16?.lockedAt || null,
    qfStatus,
    qfOpenedAt: adminQf.data?.pool?.qf?.openedAt || null,
    qfLockedAt: adminQf.data?.pool?.qf?.lockedAt || null,
    sfStatus,
    sfOpenedAt: adminSf.data?.pool?.sf?.openedAt || null,
    sfLockedAt: adminSf.data?.pool?.sf?.lockedAt || null
  },
  counts: {
    participants: health.data?.counts?.participants ?? null,
    preTournamentSubmissions: health.data?.counts?.preTournamentSubmissions ?? null,
    r32Submissions: health.data?.counts?.r32Submissions ?? null,
    r16Submissions: health.data?.counts?.r16Submissions ?? null,
    qfSubmissions: health.data?.counts?.qfSubmissions ?? null,
    sfSubmissions: health.data?.counts?.sfSubmissions ?? null,
    adminR32Matches: r32Matches.length,
    scoredR32Matches,
    adminR16Matches: r16Matches.length,
    publicR16Matches: publicR16.data?.matches?.length ?? null,
    scoredR16Matches,
    adminQfMatches: qfMatches.length,
    scoredQfMatches,
    adminSfMatches: sfMatches.length,
    publicSfMatches: publicSf.data?.matches?.length ?? null,
    scoredSfMatches
  },
  nextAction: nextActionFor(r16Status, scoredR32Matches, qfStatus, scoredR16Matches, sfStatus, scoredQfMatches)
};

if (failures.length > 0) {
  result.failures = failures;
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));

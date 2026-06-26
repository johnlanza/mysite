#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...valueParts] = arg.replace(/^--/, "").split("=");
  args.set(key, valueParts.join("=") || "true");
}

const baseUrl = (args.get("base-url") || process.env.POOLARAMA_BASE_URL || "https://www.johnlanza.com/poolarama").replace(/\/+$/, "");
const adminToken = args.get("admin-token") || process.env.POOLARAMA_ADMIN_TOKEN || "";
const expectedParticipants = Number(args.get("expected-participants") || process.env.POOLARAMA_EXPECTED_PARTICIPANTS || 15);
const expectedSubmissions = Number(args.get("expected-submissions") || process.env.POOLARAMA_EXPECTED_SUBMISSIONS || 15);
const expectedLockState = args.get("expected-lock-state") || process.env.POOLARAMA_EXPECTED_LOCK_STATE || "locked";
const backupDir = args.get("backup-dir") || process.env.POOLARAMA_BACKUP_DIR || ".poolarama-backups";

const failures = [];

if (!adminToken) {
  console.error("Missing Poolarama admin token.");
  console.error("Use --admin-token=... or set POOLARAMA_ADMIN_TOKEN.");
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
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

const poolState = await requestJson("/api/pool-state");
assert(poolState.response.status === 200, `pool-state status ${poolState.response.status}`);
assert(poolState.data?.storageMode === "mongo", `pool-state storageMode ${poolState.data?.storageMode}`);
assert(poolState.data?.pool?.preTournament?.status === expectedLockState, `preTournament status ${poolState.data?.pool?.preTournament?.status}`);

const unauthOverview = await requestJson("/api/admin/overview");
assert(unauthOverview.response.status === 401, `unauth admin overview status ${unauthOverview.response.status}`);

const health = await requestJson("/api/admin/health", { headers: adminHeaders() });
assert(health.response.status === 200, `health status ${health.response.status}`);
assert(health.data?.ok === true, "health ok was not true");
assert(health.data?.storageMode === "mongo", `health storageMode ${health.data?.storageMode}`);
assert(health.data?.counts?.participants === expectedParticipants, `health participants ${health.data?.counts?.participants}`);
assert(health.data?.counts?.preTournamentSubmissions === expectedSubmissions, `health submissions ${health.data?.counts?.preTournamentSubmissions}`);
assert(health.data?.pool?.preTournament?.status === expectedLockState, `health lock state ${health.data?.pool?.preTournament?.status}`);

const overview = await requestJson("/api/admin/overview", { headers: adminHeaders() });
assert(overview.response.status === 200, `admin overview status ${overview.response.status}`);
assert(overview.data?.storageMode === "mongo", `overview storageMode ${overview.data?.storageMode}`);
assert(overview.data?.participants?.length === expectedParticipants, `overview participants ${overview.data?.participants?.length}`);
assert(overview.data?.participants?.filter((participant) => participant.submitted).length === expectedSubmissions, "overview submitted count mismatch");
assert(overview.data?.participants?.every((participant) => participant.code !== "jessie"), "retired Jessie appeared in active roster");

const publicPicks = await requestJson("/api/picks?viewerCode=definitely-invalid");
assert(publicPicks.response.status === 200, `public picks status ${publicPicks.response.status}`);
assert(publicPicks.data?.storageMode === "mongo", `public picks storageMode ${publicPicks.data?.storageMode}`);
assert(publicPicks.data?.participants?.length === expectedParticipants, `public picks participants ${publicPicks.data?.participants?.length}`);
assert(publicPicks.data?.participants?.filter((participant) => participant.submitted).length === expectedSubmissions, "public picks submitted count mismatch");
if (expectedLockState === "locked") {
  assert(publicPicks.data?.participants?.filter((participant) => participant.visible).length === expectedParticipants, "locked public picks are not all visible");
} else {
  assert(publicPicks.data?.participants?.filter((participant) => participant.visible).length === 0, "open public picks exposed data to invalid viewer");
}

const standings = await requestJson("/api/standings");
assert(standings.response.status === 200, `standings status ${standings.response.status}`);
assert(standings.data?.storageMode === "mongo", `standings storageMode ${standings.data?.storageMode}`);
assert(standings.data?.standings?.length === expectedParticipants, `standings count ${standings.data?.standings?.length}`);

const backup = await requestJson("/api/admin/backup", { headers: adminHeaders() });
assert(backup.response.status === 200, `backup status ${backup.response.status}`);
assert(backup.data?.counts?.preTournamentSubmissions >= expectedSubmissions, `backup submissions ${backup.data?.counts?.preTournamentSubmissions}`);

await fs.mkdir(backupDir, { recursive: true });
const backupFile = path.join(backupDir, `poolarama-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await fs.writeFile(backupFile, `${JSON.stringify(backup.data, null, 2)}\n`);

if (failures.length > 0) {
  console.error("Poolarama smoke test failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(`Backup saved: ${backupFile}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  participants: overview.data.participants.length,
  submissions: overview.data.participants.filter((participant) => participant.submitted).length,
  lockState: poolState.data.pool.preTournament.status,
  backupFile
}, null, 2));

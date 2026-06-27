#!/usr/bin/env node

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...valueParts] = arg.replace(/^--/, "").split("=");
  args.set(key, valueParts.join("=") || "true");
}

const baseUrl = (args.get("base-url") || process.env.POOLARAMA_BASE_URL || "https://www.johnlanza.com/poolarama").replace(/\/+$/, "");
const adminToken = args.get("admin-token") || process.env.POOLARAMA_ADMIN_TOKEN || "";
const participantCode = args.get("participant-code") || process.env.POOLARAMA_R32_SMOKE_PARTICIPANT_CODE || "";
const mutate =
  args.get("mutate") === "true" ||
  process.env.POOLARAMA_R32_SMOKE_MUTATE === "true";

const failures = [];

if (!adminToken) {
  console.error("Missing Poolarama admin token.");
  console.error("Use --admin-token=... or set POOLARAMA_ADMIN_TOKEN.");
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function adminHeaders(extra = {}) {
  return {
    ...extra,
    "x-poolarama-admin": adminToken
  };
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

async function adminR32Post(body) {
  return requestJson("/api/admin/r32", {
    method: "POST",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body)
  });
}

function matchWinnerPicks(matches, side = "teamA") {
  return Object.fromEntries(matches.map((match) => [match.matchId, match[side]]));
}

function knockoutScoreFor(participant) {
  return participant?.scoring?.find((row) => row.label === "Knockout")?.value || 0;
}

const health = await requestJson("/api/admin/health", { headers: adminHeaders() });
assert(health.response.status === 200, `health status ${health.response.status}`);
assert(health.data?.ok === true, "health ok was not true");
assert(health.data?.storageMode === "mongo", `health storageMode ${health.data?.storageMode}`);

const initialAdminR32 = await requestJson("/api/admin/r32", { headers: adminHeaders() });
assert(initialAdminR32.response.status === 200, `admin r32 status ${initialAdminR32.response.status}`);
assert(initialAdminR32.data?.storageMode === "mongo", `admin r32 storageMode ${initialAdminR32.data?.storageMode}`);

let previewMatches = [];
let initialStatus = initialAdminR32.data?.pool?.r32?.status || "unknown";

if (initialStatus === "setup") {
  const preview = await adminR32Post({ action: "preview" });
  assert(preview.response.status === 200, `preview status ${preview.response.status}`);
  assert(preview.data?.previewOnly === true, "preview was not marked previewOnly");
  assert(preview.data?.matches?.length === 16, `preview match count ${preview.data?.matches?.length}`);
  previewMatches = preview.data?.matches || [];

  const publicSetupR32 = await requestJson("/api/r32");
  assert(publicSetupR32.response.status === 200, `public setup r32 status ${publicSetupR32.response.status}`);
  assert(publicSetupR32.data?.pool?.r32?.status === "setup", `public setup r32 pool status ${publicSetupR32.data?.pool?.r32?.status}`);
  assert(publicSetupR32.data?.matches?.length === 0, `setup public r32 exposed ${publicSetupR32.data?.matches?.length} matches`);
} else {
  previewMatches = initialAdminR32.data?.matches || [];
  assert(previewMatches.length === 16, `non-setup admin r32 match count ${previewMatches.length}`);
}

if (!mutate) {
  if (failures.length > 0) {
    console.error("Poolarama R32 smoke test failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    mode: "preview-only",
    r32Status: initialStatus,
    previewMatches: previewMatches.length,
    mutationSkipped: true
  }, null, 2));
  process.exit(0);
}

if (initialStatus !== "setup") {
  failures.push(`mutating R32 smoke requires setup status, got ${initialStatus}`);
}

if (!participantCode) {
  failures.push("mutating R32 smoke requires --participant-code=... or POOLARAMA_R32_SMOKE_PARTICIPANT_CODE");
}

if (failures.length === 0) {
  const open = await adminR32Post({
    action: "open",
    confirmation: "OPEN",
    previewMatches
  });
  assert(open.response.status === 200, `open status ${open.response.status}`);
  assert(open.data?.pool?.r32?.status === "open", `open r32 status ${open.data?.pool?.r32?.status}`);
  assert(open.data?.matches?.length === 16, `open match count ${open.data?.matches?.length}`);
  assert(Boolean(open.data?.backup?.backupId), "open did not create a backup");

  const publicOpen = await requestJson("/api/r32");
  assert(publicOpen.response.status === 200, `public open r32 status ${publicOpen.response.status}`);
  assert(publicOpen.data?.matches?.length === 16, `public open r32 match count ${publicOpen.data?.matches?.length}`);

  const picks = matchWinnerPicks(open.data?.matches || [], "teamA");
  const submit = await requestJson("/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      participantCode,
      stage: "r32",
      picks: { matchWinners: picks }
    })
  });
  assert(submit.response.status === 200, `r32 submission status ${submit.response.status}`);

  const lock = await adminR32Post({ action: "lock" });
  assert(lock.response.status === 200, `lock status ${lock.response.status}`);
  assert(lock.data?.pool?.r32?.status === "locked", `lock r32 status ${lock.data?.pool?.r32?.status}`);
  assert(Boolean(lock.data?.backup?.backupId), "lock did not create a backup");

  const firstMatch = lock.data?.matches?.[0];
  const score = await adminR32Post({
    action: "score",
    matchId: firstMatch?.matchId,
    winner: firstMatch?.teamA
  });
  assert(score.response.status === 200, `score status ${score.response.status}`);
  assert(score.data?.matches?.find((match) => match.matchId === firstMatch?.matchId)?.winner === firstMatch?.teamA, "winner was not saved");
  assert(Boolean(score.data?.backup?.backupId), "score did not create a backup");

  const publicPicks = await requestJson("/api/picks?viewerCode=definitely-invalid");
  const participant = publicPicks.data?.participants?.find((item) => item.code === participantCode);
  assert(publicPicks.response.status === 200, `public picks status ${publicPicks.response.status}`);
  assert(Boolean(participant), `participant ${participantCode} was not present in public picks`);
  assert(knockoutScoreFor(participant) >= 1, `knockout score ${knockoutScoreFor(participant)}`);
}

if (failures.length > 0) {
  console.error("Poolarama R32 smoke test failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  mode: "mutating",
  participantCode,
  opened: true,
  locked: true,
  scoredFirstMatch: true
}, null, 2));

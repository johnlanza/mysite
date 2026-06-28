#!/usr/bin/env node

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, ...valueParts] = arg.replace(/^--/, "").split("=");
  args.set(key, valueParts.join("=") || "true");
}

const baseUrl = (args.get("base-url") || process.env.POOLARAMA_BASE_URL || "https://www.johnlanza.com/poolarama").replace(/\/+$/, "");
const adminToken = args.get("admin-token") || process.env.POOLARAMA_ADMIN_TOKEN || "";
const participantCode = args.get("participant-code") || process.env.POOLARAMA_R16_SMOKE_PARTICIPANT_CODE || "";
const mutate =
  args.get("mutate") === "true" ||
  process.env.POOLARAMA_R16_SMOKE_MUTATE === "true";
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

async function adminR16Post(body) {
  return requestJson("/api/admin/r16", {
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

const [health, initialAdminR32, initialAdminR16, initialPublicR16] = await Promise.all([
  requestJson("/api/admin/health", { headers: adminHeaders() }),
  requestJson("/api/admin/r32", { headers: adminHeaders() }),
  requestJson("/api/admin/r16", { headers: adminHeaders() }),
  requestJson("/api/r16")
]);

assert(health.response.status === 200, `health status ${health.response.status}`);
assert(health.data?.ok === true, "health ok was not true");
assert(health.data?.storageMode === "mongo", `health storageMode ${health.data?.storageMode}`);
assert(initialAdminR32.response.status === 200, `admin r32 status ${initialAdminR32.response.status}`);
assert(initialAdminR16.response.status === 200, `admin r16 status ${initialAdminR16.response.status}`);
assert(initialAdminR16.data?.storageMode === "mongo", `admin r16 storageMode ${initialAdminR16.data?.storageMode}`);
assert(initialPublicR16.response.status === 200, `public r16 status ${initialPublicR16.response.status}`);

const initialStatus = initialAdminR16.data?.pool?.r16?.status || "unknown";
const r32Matches = initialAdminR32.data?.matches || [];
const scoredR32Matches = r32Matches.filter((match) => Boolean(match.winner)).length;
let previewMatches = [];

if (initialStatus === "setup") {
  const preview = await adminR16Post({ action: "preview" });

  if (scoredR32Matches === 16) {
    assert(preview.response.status === 200, `preview status ${preview.response.status}`);
    assert(preview.data?.previewOnly === true, "preview was not marked previewOnly");
    assert(preview.data?.matches?.length === 8, `preview match count ${preview.data?.matches?.length}`);
    previewMatches = preview.data?.matches || [];

    const staleOpen = await adminR16Post({
      action: "open",
      confirmation: "OPEN",
      previewMatches: previewMatches.slice(0, 7)
    });
    assert(staleOpen.response.status === 409, `stale preview open status ${staleOpen.response.status}`);
  } else {
    assert(preview.response.status >= 400, `preview should fail before all R32 winners, got ${preview.response.status}`);
  }

  assert(initialPublicR16.data?.matches?.length === 0, `setup public r16 exposed ${initialPublicR16.data?.matches?.length} matches`);
} else {
  previewMatches = initialAdminR16.data?.matches || [];
  assert(previewMatches.length === 8, `non-setup admin r16 match count ${previewMatches.length}`);
  assert(initialPublicR16.data?.matches?.length === previewMatches.length, "public/admin r16 match count mismatch");
}

const lockWithoutOpen = initialStatus === "setup" ? await adminR16Post({ action: "lock" }) : null;
if (lockWithoutOpen) {
  assert(lockWithoutOpen.response.status === 409, `lock without open status ${lockWithoutOpen.response.status}`);
}

if (!mutate) {
  if (failures.length > 0) {
    console.error("Poolarama R16 smoke test failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    mode: "preview-only",
    r16Status: initialStatus,
    scoredR32Matches,
    previewMatches: previewMatches.length,
    mutationSkipped: true
  }, null, 2));
  process.exit(0);
}

if (initialStatus !== "setup") {
  failures.push(`mutating R16 smoke requires setup status, got ${initialStatus}`);
}

if (scoredR32Matches !== 16) {
  failures.push(`mutating R16 smoke requires 16 scored R32 matches, got ${scoredR32Matches}`);
}

if (!participantCode) {
  failures.push("mutating R16 smoke requires --participant-code=... or POOLARAMA_R16_SMOKE_PARTICIPANT_CODE");
}

if (failures.length === 0) {
  const open = await adminR16Post({
    action: "open",
    confirmation: "OPEN",
    previewMatches
  });
  assert(open.response.status === 200, `open status ${open.response.status}`);
  assert(open.data?.pool?.r16?.status === "open", `open r16 status ${open.data?.pool?.r16?.status}`);
  assert(open.data?.matches?.length === 8, `open match count ${open.data?.matches?.length}`);
  assert(Boolean(open.data?.backup?.backupId), "open did not create a backup");

  const publicOpen = await requestJson("/api/r16");
  assert(publicOpen.response.status === 200, `public open r16 status ${publicOpen.response.status}`);
  assert(publicOpen.data?.matches?.length === 8, `public open r16 match count ${publicOpen.data?.matches?.length}`);

  const picks = matchWinnerPicks(open.data?.matches || [], "teamA");
  const submit = await requestJson("/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      participantCode,
      stage: "r16",
      picks: { matchWinners: picks }
    })
  });
  assert(submit.response.status === 200, `r16 submission status ${submit.response.status}`);

  const lock = await adminR16Post({ action: "lock" });
  assert(lock.response.status === 200, `lock status ${lock.response.status}`);
  assert(lock.data?.pool?.r16?.status === "locked", `lock r16 status ${lock.data?.pool?.r16?.status}`);
  assert(Boolean(lock.data?.backup?.backupId), "lock did not create a backup");

  const firstMatch = lock.data?.matches?.[0];
  const score = await adminR16Post({
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
  assert(knockoutScoreFor(participant) >= 2, `knockout score ${knockoutScoreFor(participant)}`);
}

if (failures.length > 0) {
  console.error("Poolarama R16 smoke test failed:");
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

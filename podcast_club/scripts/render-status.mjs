#!/usr/bin/env node

const apiKey = process.env.RENDER_API_KEY;
const serviceId = process.env.RENDER_SERVICE_ID;
const deployId = process.env.RENDER_DEPLOY_ID || '';
const apiBase = process.env.RENDER_API_BASE || 'https://api.render.com/v1';
const shouldWait = parseBoolean(process.env.RENDER_WAIT || process.env.RENDER_WAIT_FOR_LIVE);
const requiredStatuses =
  parseCsv(process.env.RENDER_REQUIRED_STATUS || process.env.RENDER_EXPECTED_STATUS) ||
  (shouldWait ? ['live'] : []);
const requireShaMatch = parseBoolean(process.env.RENDER_REQUIRE_SHA_MATCH || process.env.RENDER_REQUIRE_COMMIT_MATCH);
const allowMissingSha = parseBoolean(process.env.RENDER_ALLOW_MISSING_SHA);
const expectedSha = process.env.RENDER_EXPECTED_SHA || process.env.GIT_SHA || '';
const pollSeconds = parsePositiveNumber(process.env.RENDER_POLL_SECONDS, 10);
const timeoutSeconds = parsePositiveNumber(process.env.RENDER_WAIT_TIMEOUT_SECONDS, 600);

const failedStatuses = new Set([
  'build_failed',
  'canceled',
  'cancelled',
  'deactivated',
  'pre_deploy_failed',
  'update_failed'
]);

if (!apiKey || !serviceId) {
  console.error('Missing required env vars: RENDER_API_KEY and/or RENDER_SERVICE_ID');
  console.error('Example: RENDER_API_KEY=... RENDER_SERVICE_ID=... npm run render:status');
  process.exit(1);
}

function parseBoolean(value) {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseCsv(value) {
  const values = String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return values.length > 0 ? values : null;
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pickLatestDeploy(payload) {
  if (Array.isArray(payload)) return payload[0] || null;
  if (Array.isArray(payload?.deploys)) return payload.deploys[0] || null;
  if (payload?.deploy) return payload.deploy;
  if (payload?.id || payload?.deployId) return payload;
  return null;
}

function getDeployCommitSha(deploy) {
  if (!deploy || typeof deploy !== 'object') return null;
  return (
    deploy?.commit?.id ||
    deploy?.commit?.sha ||
    deploy?.commitId ||
    deploy?.commitSHA ||
    deploy?.gitCommitId ||
    deploy?.gitCommitSha ||
    null
  );
}

function shortSha(value) {
  if (!value) return '';
  return String(value).slice(0, 7);
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getDeployStatus(deploy) {
  return deploy?.status || deploy?.state || 'unknown';
}

function getDeployId(deploy) {
  return deploy?.id || deploy?.deployId || 'unknown';
}

function shasMatch(expected, actual) {
  if (!expected || !actual) return false;
  const normalizedExpected = String(expected).trim();
  const normalizedActual = String(actual).trim();
  return normalizedExpected === normalizedActual ||
    normalizedExpected.startsWith(normalizedActual) ||
    normalizedActual.startsWith(normalizedExpected);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDeploy() {
  const endpoint = deployId
    ? `${apiBase}/services/${encodeURIComponent(serviceId)}/deploys/${encodeURIComponent(deployId)}`
    : `${apiBase}/services/${encodeURIComponent(serviceId)}/deploys?limit=1`;
  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json'
    }
  });

  const raw = await res.text();
  const payload = parseJsonSafe(raw);

  if (!res.ok) {
    console.error(`Render API request failed: ${res.status} ${res.statusText}`);
    if (payload?.message) {
      console.error(payload.message);
    } else if (raw) {
      console.error(raw);
    }
    process.exit(1);
  }

  const deploy = pickLatestDeploy(payload);
  if (!deploy) {
    console.error('No deploys found for this Render service.');
    process.exit(1);
  }

  return deploy;
}

async function getDeployWithWait() {
  const startedAt = Date.now();

  for (;;) {
    const deploy = await fetchDeploy();
    const status = getDeployStatus(deploy);
    const id = getDeployId(deploy);

    if (!shouldWait) {
      return deploy;
    }

    console.log(`[${new Date().toISOString()}] Deploy ${id} status: ${status}`);

    if (requiredStatuses.includes(status)) {
      return deploy;
    }

    if (failedStatuses.has(status)) {
      throw new Error(`Render deploy ${id} reached failure status: ${status}`);
    }

    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    if (elapsedSeconds >= timeoutSeconds) {
      throw new Error(
        `Timed out after ${timeoutSeconds}s waiting for Render deploy ${id} to reach ${requiredStatuses.join(', ')}.`
      );
    }

    await sleep(pollSeconds * 1000);
  }
}

async function run() {
  const deploy = await getDeployWithWait();
  const localSha = expectedSha || (await git('rev-parse HEAD'));
  const deployedSha = getDeployCommitSha(deploy);
  const deployStatus = getDeployStatus(deploy);
  const latestDeployId = getDeployId(deploy);
  const deployCreatedAt = deploy.createdAt || deploy.created_at || deploy.created || 'unknown';

  console.log(`Service: ${serviceId}`);
  console.log(`Latest deploy id: ${latestDeployId}`);
  console.log(`Latest deploy status: ${deployStatus}`);
  console.log(`Latest deploy created: ${deployCreatedAt}`);
  console.log(`Local HEAD: ${shortSha(localSha)} (${localSha})`);

  if (requiredStatuses.length > 0 && !requiredStatuses.includes(deployStatus)) {
    throw new Error(`Expected deploy status ${requiredStatuses.join(', ')}, got ${deployStatus}.`);
  }

  if (!deployedSha) {
    console.log('Deployed commit: (not exposed by API payload)');
    console.log('Tip: verify commit in Render dashboard deploy details.');
    if (requireShaMatch && !allowMissingSha) {
      throw new Error('Unable to verify deployed commit because Render did not expose a commit SHA.');
    }
    return;
  }

  console.log(`Deployed commit: ${shortSha(deployedSha)} (${deployedSha})`);
  const matched = shasMatch(localSha, deployedSha);
  console.log(matched ? 'Result: local HEAD matches deployed commit.' : 'Result: local HEAD differs from deployed commit.');

  if (requireShaMatch && !matched) {
    throw new Error('Render deploy commit does not match the expected local commit.');
  }
}

async function git(cmd) {
  const { execSync } = await import('node:child_process');
  return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
